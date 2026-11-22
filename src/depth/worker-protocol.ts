// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// Messages between the window and the depth model's worker.

export type WorkerRequest =
  | { kind: "init"; ortUrl: string; wasmBase: string; threads: number; initTimeoutMs: number; model: ArrayBuffer }
  | { kind: "run"; id: number; rgba: Uint8ClampedArray; width: number; height: number };

export type WorkerReply =
  | { kind: "ready" }
  | { kind: "depth"; id: number; width: number; height: number; data: Float32Array }
  | { kind: "error"; id?: number; message: string };
