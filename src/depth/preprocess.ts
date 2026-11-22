// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// What the depth model takes and what is made of its answer. The model is
// Depth Anything V2 Small: an RGB image, its short side 518 px and both sides
// multiples of 14 (its patch size), normalized by ImageNet's mean and spread,
// in; relative disparity at the same size, out.

import { depthSize, normalizeDisparity, resample, type DepthMap } from "./map";

export const MODEL_SHORT = 518;
/** The longest side the model is run at: a panorama costs no more than 16:9. */
export const MODEL_LONG_MAX = 924;
const PATCH = 14;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const toPatch = (v: number): number => Math.max(PATCH, Math.round(v / PATCH) * PATCH);

/** The size a `width` × `height` image is run at. */
export function modelSize(width: number, height: number): { width: number; height: number } {
  let scale = MODEL_SHORT / Math.min(width, height);
  if (Math.max(width, height) * scale > MODEL_LONG_MAX) scale = MODEL_LONG_MAX / Math.max(width, height);
  return { width: toPatch(width * scale), height: toPatch(height * scale) };
}

/** 8-bit RGBA resized for the model and laid out as its input tensor: three
 *  planes, normalized. */
export function modelInput(rgba: ArrayLike<number>, width: number, height: number): { data: Float32Array; width: number; height: number } {
  const size = modelSize(width, height);
  const plane = size.width * size.height;
  const data = new Float32Array(3 * plane);
  for (let c = 0; c < 3; c++) {
    const channel: DepthMap = { width, height, data: new Float32Array(width * height) };
    for (let i = 0; i < width * height; i++) channel.data[i] = rgba[4 * i + c] / 255;
    const resized = resample(channel, size.width, size.height);
    for (let i = 0; i < plane; i++) data[c * plane + i] = (resized.data[i] - MEAN[c]) / STD[c];
  }
  return { data, ...size };
}

/** The model's raw disparity (`width` × `height`) as the depth map of a
 *  `gw` × `gh` photo: spread to 0..1 and brought to the map's size. Its edges
 *  are left as the model drew them: pulling them onto the photo's edges with a
 *  guided filter bled a dark subject into dark water behind it. */
export function refineDepth(raw: Float32Array, width: number, height: number, gw: number, gh: number): DepthMap {
  const size = depthSize(gw, gh);
  return resample({ width, height, data: normalizeDisparity(raw) }, size.width, size.height);
}
