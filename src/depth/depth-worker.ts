// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The depth model's worker: ONNX Runtime Web (MIT) on WebAssembly, loaded from
// the copy this extension ships in dist/ort, so a photo is estimated off the
// window's thread and on any computer, GPU or not. Built inline into the
// bundle, so it starts wherever the extension does; the runtime it loads is
// served only for an installed extension. A runtime that fails to start can't
// be started again in the same worker, so a failed init is final: the window
// ends this worker and starts another (estimator.ts).

import type * as Ort from "onnxruntime-web";
import { modelInput, refineDepth } from "./preprocess";
import type { WorkerReply, WorkerRequest } from "./worker-protocol";

let ort: typeof Ort | null = null;
let session: Ort.InferenceSession | null = null;

const reply = (message: WorkerReply, transfer: Transferable[] = []) => postMessage(message, { transfer });
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function open(request: Extract<WorkerRequest, { kind: "init" }>): Promise<void> {
  ort = (await import(/* @vite-ignore */ request.ortUrl)) as typeof Ort;
  ort.env.wasm.wasmPaths = request.wasmBase;
  ort.env.wasm.proxy = false;
  ort.env.wasm.numThreads = request.threads;
  ort.env.wasm.initTimeout = request.initTimeoutMs;
  session = await ort.InferenceSession.create(new Uint8Array(request.model), { executionProviders: ["wasm"] });
}

async function run(request: Extract<WorkerRequest, { kind: "run" }>): Promise<void> {
  if (!ort || !session) throw new Error("the depth model isn't loaded");
  const input = modelInput(request.rgba, request.width, request.height);
  const tensor = new ort.Tensor("float32", input.data, [1, 3, input.height, input.width]);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const predicted = out[session.outputNames[0]];
  const [height, width] = predicted.dims.slice(-2);
  const map = refineDepth(Float32Array.from(predicted.data as Float32Array), width, height, request.width, request.height);
  reply({ kind: "depth", id: request.id, width: map.width, height: map.height, data: map.data }, [map.data.buffer]);
}

onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.kind === "init") {
    open(request).then(
      () => reply({ kind: "ready" }),
      (e) => reply({ kind: "error", message: reason(e) }),
    );
  } else {
    run(request).catch((e) => reply({ kind: "error", id: request.id, message: reason(e) }));
  }
};
