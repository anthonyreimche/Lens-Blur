// @vitest-environment node
// The depth model's worker as the window drives it: started on demand with
// the model handed over, replaced by a single-thread one when several threads
// won't start, ended when it won't start or answer in time, and ended after a
// minute without work.

import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkerEstimator, type EstimatorTimes } from "../src/depth/estimator";
import type { WorkerReply, WorkerRequest } from "../src/depth/worker-protocol";

type Behaviour = (req: WorkerRequest, worker: FakeWorker) => void;

class FakeWorker {
  onmessage: ((e: MessageEvent<WorkerReply>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly requests: WorkerRequest[] = [];
  constructor(private readonly behave: Behaviour) {}
  postMessage(req: WorkerRequest): void {
    this.requests.push(req);
    this.behave(req, this);
  }
  answer(reply: WorkerReply): void {
    queueMicrotask(() => this.onmessage?.({ data: reply } as MessageEvent<WorkerReply>));
  }
  terminate(): void {
    this.terminated = true;
  }
}

const TIMES: EstimatorTimes = { initMs: 1_000, runMs: 2_000, idleMs: 60_000 };
const PIXELS = { data: new Uint8ClampedArray(8 * 6 * 4), width: 8, height: 6 };

const works: Behaviour = (req, w) => {
  if (req.kind === "init") w.answer({ kind: "ready" });
  else w.answer({ kind: "depth", id: req.id, width: 2, height: 1, data: new Float32Array([0, 1]) });
};

function estimator(behaviours: Behaviour[], threads = 4) {
  const workers: FakeWorker[] = [];
  const loads = vi.fn(async () => new ArrayBuffer(4));
  const est = new WorkerEstimator({
    loadModel: loads,
    runtime: "app://bundle/ort/",
    threads,
    times: TIMES,
    open: () => {
      const w = new FakeWorker(behaviours[Math.min(workers.length, behaviours.length - 1)]);
      workers.push(w);
      return w as unknown as Worker;
    },
  });
  return { est, workers, loads };
}

afterEach(() => vi.useRealTimers());

describe("the depth model's worker", () => {
  it("starts on demand, hands the model over and reads the map back", async () => {
    const { est, workers, loads } = estimator([works]);
    expect(workers).toHaveLength(0);
    const map = await est.estimate(PIXELS);
    expect(map).toEqual({ width: 2, height: 1, data: new Float32Array([0, 1]) });
    const init = workers[0].requests[0];
    expect(init.kind === "init" && init.threads).toBe(4);
    expect(init.kind === "init" && init.initTimeoutMs).toBe(TIMES.initMs);
    expect(loads).toHaveBeenCalledTimes(1);
    await est.estimate(PIXELS);
    expect(workers).toHaveLength(1);
  });

  it("ends a worker whose threads won't start and starts a single-thread one in its place", async () => {
    const fails: Behaviour = (req, w) => req.kind === "init" && w.answer({ kind: "error", message: "aborted" });
    const { est, workers, loads } = estimator([fails, works]);
    await est.estimate(PIXELS);
    expect(workers[0].terminated).toBe(true);
    const init = workers[1].requests[0];
    expect(init.kind === "init" && init.threads).toBe(1);
    expect(loads).toHaveBeenCalledTimes(2);
  });

  it("gives up, ending the worker, when the runtime won't start in time", async () => {
    vi.useFakeTimers();
    const silent: Behaviour = () => undefined;
    const { est, workers } = estimator([silent], 1);
    const job = est.estimate(PIXELS);
    const failed = expect(job).rejects.toThrow(/took too long to load/);
    await vi.advanceTimersByTimeAsync(TIMES.initMs + 5_000);
    await failed;
    expect(workers[0].terminated).toBe(true);
  });

  it("stops an estimate that doesn't finish in time, and the next one starts afresh", async () => {
    vi.useFakeTimers();
    const hangs: Behaviour = (req, w) => req.kind === "init" && w.answer({ kind: "ready" });
    const { est, workers } = estimator([hangs, works], 1);
    const job = est.estimate(PIXELS);
    const failed = expect(job).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(TIMES.runMs);
    await failed;
    expect(workers[0].terminated).toBe(true);
    await expect(est.estimate(PIXELS)).resolves.toMatchObject({ width: 2 });
    expect(workers).toHaveLength(2);
  });

  it("ends the worker after a minute without work, letting go of the model", async () => {
    vi.useFakeTimers();
    const { est, workers } = estimator([works]);
    await est.estimate(PIXELS);
    await vi.advanceTimersByTimeAsync(TIMES.idleMs - 1);
    expect(workers[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(workers[0].terminated).toBe(true);
  });
});
