// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// Estimating a photo's depth: with the model in its worker, or without it.
//
// The worker starts when an estimate is asked for, is handed the model (which
// the window lets go of) and ends after a minute without work, so the model's
// memory is held only while estimates come. A worker that doesn't start, or
// an estimate that doesn't finish, in its time is ended; a worker that won't
// start with several threads is replaced by one with a single thread.

import { EXT_ID } from "../params";
import DepthWorker from "./depth-worker?worker&inline";
import { depthSize, resample, simpleDepth, type DepthMap } from "./map";
import type { WorkerReply, WorkerRequest } from "./worker-protocol";

declare const __EXT_VERSION__: string;

/** 8-bit RGBA rows from the top, as api.develop.sourcePixels gives them. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface DepthEstimator {
  estimate(pixels: Pixels): Promise<DepthMap>;
  dispose(): void;
}

/** "model": Depth Anything V2 Small. "simple": far at the top, near at the bottom. */
export type DepthMethod = "model" | "simple";

/** The simple depth at the size a map of the photo is kept at. */
export function simpleDepthFor(pixels: Pick<Pixels, "width" | "height">): DepthMap {
  const size = depthSize(pixels.width, pixels.height);
  return simpleDepth(size.width, size.height);
}

/** A depth map brought to the size kept for a `pixels`-sized photo. */
export function fitTo(map: DepthMap, pixels: Pick<Pixels, "width" | "height">): DepthMap {
  const size = depthSize(pixels.width, pixels.height);
  return map.width === size.width && map.height === size.height ? map : resample(map, size.width, size.height);
}

/** Where the installed extension's runtime files are served. import.meta.url
 *  is undefined in an installed extension's module, so the URL is built as
 *  core's loader builds it. */
export function runtimeUrl(file: string): string {
  return `${location.origin}/__plugins__/${EXT_ID}/dist/ort/${file}`;
}

/** Threads for the model: a few, leaving a core for the window, where the
 *  page may share memory between them. */
export function modelThreads(): number {
  if (typeof crossOriginIsolated === "undefined" || !crossOriginIsolated) return 1;
  return Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
}

export interface EstimatorTimes {
  /** How long the runtime may take to start. */
  initMs: number;
  /** How long one estimate may take. */
  runMs: number;
  /** How long the worker is kept without work. */
  idleMs: number;
}

export const ESTIMATOR_TIMES: EstimatorTimes = { initMs: 60_000, runMs: 180_000, idleMs: 60_000 };

export interface WorkerEstimatorOptions {
  /** Reads the model's bytes, each time a worker starts. */
  loadModel: () => Promise<ArrayBuffer>;
  /** Where dist/ort is served, ending in "/". */
  runtime?: string;
  threads?: number;
  open?: () => Worker;
  times?: EstimatorTimes;
}

const failure = (message: string) => new Error(message);

export class WorkerEstimator implements DepthEstimator {
  private worker: Worker | null = null;
  private starting: Promise<Worker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idle: ReturnType<typeof setTimeout> | null = null;
  private next = 1;
  private readonly runtime: string;
  private readonly open: () => Worker;
  private readonly times: EstimatorTimes;

  constructor(private readonly options: WorkerEstimatorOptions) {
    this.runtime = options.runtime ?? runtimeUrl("");
    this.open = options.open ?? (() => new DepthWorker({ name: "Lens Blur depth" }));
    this.times = options.times ?? ESTIMATOR_TIMES;
  }

  /** A worker with the model loaded, `threads` threads, or the reason it
   *  couldn't start; a failed one is ended. */
  private async startWith(threads: number): Promise<Worker> {
    const model = await this.options.loadModel();
    const worker = this.open();
    const v = typeof __EXT_VERSION__ === "string" ? __EXT_VERSION__ : "";
    const request: WorkerRequest = {
      kind: "init",
      ortUrl: `${this.runtime}ort.wasm.min.mjs${v ? `?v=${encodeURIComponent(v)}` : ""}`,
      wasmBase: this.runtime,
      threads,
      initTimeoutMs: this.times.initMs,
      model,
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(failure("The depth model took too long to load.")), this.times.initMs + 5_000);
        worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
          clearTimeout(timer);
          if (data.kind === "ready") resolve();
          else reject(failure(`The depth model wouldn't load: ${data.kind === "error" ? data.message : "no answer"}`));
        };
        worker.onerror = (e) => {
          clearTimeout(timer);
          reject(failure(`The depth model's worker stopped: ${e.message || "unknown error"}`));
        };
        worker.postMessage(request, [model]);
      });
      return worker;
    } catch (e) {
      worker.terminate();
      throw e;
    }
  }

  private ready(): Promise<Worker> {
    if (this.worker) return Promise.resolve(this.worker);
    const threads = this.options.threads ?? modelThreads();
    this.starting ??= this.startWith(threads)
      .catch((e: unknown) => (threads > 1 ? this.startWith(1) : Promise.reject(e)))
      .then((w) => (this.worker = w))
      .finally(() => (this.starting = null));
    return this.starting;
  }

  private run(worker: Worker, pixels: Pixels): Promise<DepthMap> {
    const id = this.next++;
    const rgba = pixels.data.slice();
    return new Promise<DepthMap>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stop();
        reject(failure("The depth estimate took too long and was stopped."));
      }, this.times.runMs);
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (data.kind === "ready" || data.id !== id) return;
        clearTimeout(timer);
        if (data.kind === "depth") resolve({ width: data.width, height: data.height, data: data.data });
        else reject(failure(`The depth estimate failed: ${data.message}`));
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        this.stop();
        reject(failure(`The depth model's worker stopped: ${e.message || "unknown error"}`));
      };
      const request: WorkerRequest = { kind: "run", id, rgba, width: pixels.width, height: pixels.height };
      worker.postMessage(request, [rgba.buffer]);
    });
  }

  estimate(pixels: Pixels): Promise<DepthMap> {
    const job = this.queue.then(async () => {
      if (this.idle) clearTimeout(this.idle);
      try {
        return await this.run(await this.ready(), pixels);
      } finally {
        this.idle = setTimeout(() => this.stop(), this.times.idleMs);
      }
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  private stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  dispose(): void {
    if (this.idle) clearTimeout(this.idle);
    this.stop();
  }
}
