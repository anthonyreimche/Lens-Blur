// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// Depth maps: disparity from 0 (the farthest the photo holds) to 1 (the
// nearest), rows from the top of the decoded source, as the source lies in
// the stage's passes. Here they are made, resized, and packed for the GPU and
// for storage.

import type { StageTextureData } from "../safelight";

export interface DepthMap {
  width: number;
  height: number;
  data: Float32Array;
}

/** The longest edge a depth map is kept at. */
export const MAX_DEPTH_EDGE = 1024;

/** The depth without a model: the top of the frame far, the bottom near, as
 *  the ground recedes in most photos. */
export function simpleDepth(width: number, height: number): DepthMap {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) data.fill(height > 1 ? y / (height - 1) : 0.5, y * width, (y + 1) * width);
  return { width, height, data };
}

/** `map` resampled to `width` × `height`, bilinear, texel centres aligned. */
export function resample(map: DepthMap, width: number, height: number): DepthMap {
  const out = new Float32Array(width * height);
  const sx = map.width / width;
  const sy = map.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(map.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(map.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(map.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(map.width - 1, x0 + 1);
      const tx = fx - x0;
      const a = map.data[y0 * map.width + x0] * (1 - tx) + map.data[y0 * map.width + x1] * tx;
      const b = map.data[y1 * map.width + x0] * (1 - tx) + map.data[y1 * map.width + x1] * tx;
      out[y * width + x] = a * (1 - ty) + b * ty;
    }
  }
  return { width, height, data: out };
}

/** A model's raw disparity spread to 0..1 between its 1st and 99th
 *  percentiles, so a few stray texels don't squeeze the rest. */
export function normalizeDisparity(raw: Float32Array): Float32Array {
  const sorted = Float32Array.from(raw).sort();
  const lo = sorted[Math.floor(0.01 * (sorted.length - 1))] ?? 0;
  const hi = sorted[Math.floor(0.99 * (sorted.length - 1))] ?? 1;
  const span = hi - lo > 1e-6 ? hi - lo : 1;
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = Math.min(1, Math.max(0, (raw[i] - lo) / span));
  return out;
}

/** The size a depth map for a `width` × `height` photo is kept at. */
export function depthSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_DEPTH_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Texture values: depth d is stored as 0.5 + d / 2, so a texel that reads
 *  below DEPTH_PRESENT (the opaque black core draws for a variant it holds no
 *  data for) says the map isn't there. */
export const DEPTH_PRESENT = 0.25;

export function depthTexture(map: DepthMap): StageTextureData {
  const data = new Float32Array(map.data.length);
  for (let i = 0; i < data.length; i++) data[i] = 0.5 + 0.5 * Math.min(1, Math.max(0, map.data[i]));
  return { data, width: map.width, height: map.height, format: "r16f", version: 1 };
}
