// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The depth model: Depth Anything V2 Small (Yang et al. 2024, Apache-2.0),
// as onnx-community exported it, quantized to 8 bits. It is fetched once,
// when the person first asks for a depth estimate, from a fixed revision of
// its Hugging Face repository (through Safelight, from the origins the
// manifest declares), checked against its SHA-256 and kept; the kept copy is
// checked again each time it is loaded.

import type { NetworkAPI } from "../safelight";
import type { ModelStore } from "./store";

export const MODEL = {
  url: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_quantized.onnx",
  sha256: "fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d",
  bytes: 27_258_801,
} as const;

const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Downloads the model, checks it and keeps it. Rejects with a reason worded
 *  for the person. */
export async function downloadModel(network: Pick<NetworkAPI, "fetch">, store: ModelStore): Promise<void> {
  let res: Response;
  try {
    res = await network.fetch(MODEL.url, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  } catch (e) {
    throw new Error(`The depth model couldn't be downloaded: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new Error(`The depth model couldn't be downloaded (the server answered ${res.status}).`);
  const bytes = await res.arrayBuffer();
  if ((await sha256Hex(bytes)) !== MODEL.sha256) throw new Error("The downloaded depth model isn't the expected file, so it wasn't used.");
  await store.putModel(MODEL.sha256, bytes);
}

/** The kept model, checked again; a damaged copy is thrown away, so the next
 *  estimate downloads it anew. */
export async function loadModel(store: ModelStore): Promise<ArrayBuffer> {
  const bytes = await store.getModel(MODEL.sha256);
  if (!bytes) throw new Error("Lens Blur's depth model isn't downloaded yet: choose Estimate depth in its panel.");
  if ((await sha256Hex(bytes)) !== MODEL.sha256) {
    await store.deleteModel(MODEL.sha256);
    throw new Error("Lens Blur's kept depth model was damaged and has been removed: choose Estimate depth to download it again.");
  }
  return bytes;
}
