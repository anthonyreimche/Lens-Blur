// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// A photo's estimated depth, kept with the photo in the project
// (api.develop.putPhotoData), so reopening or exporting it, from the app or
// from `safelight` on the command line, needs no second estimate. The simple
// depth is never kept: it costs nothing to make again.
//
// Layout, little-endian: "LBD1", width and height (u16 each), a hash of the
// source it was made from (u32: a rotated or replaced file reads as no depth),
// a reserved u32, then the depths as u16, rows from the top.

import { shortHash } from "./strokes";
import type { DepthMap } from "./map";

export const DEPTH_DATA_KEY = "depth-model";
const MAGIC = 0x3144424c;
const HEADER = 16;

const sourceHash = (sourceKey: string): number => parseInt(shortHash(sourceKey), 36) >>> 0;

export function encodeDepth(map: DepthMap, sourceKey: string): Uint8Array {
  const bytes = new Uint8Array(HEADER + 2 * map.data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, map.width, true);
  view.setUint16(6, map.height, true);
  view.setUint32(8, sourceHash(sourceKey), true);
  for (let i = 0; i < map.data.length; i++) view.setUint16(HEADER + 2 * i, Math.round(Math.min(1, Math.max(0, map.data[i])) * 65535), true);
  return bytes;
}

/** The depth kept in `bytes`, or null when it isn't one, or was made from
 *  another source than `sourceKey`. */
export function decodeDepth(bytes: Uint8Array | null, sourceKey: string): DepthMap | null {
  if (!bytes || bytes.byteLength < HEADER) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(8, true) !== sourceHash(sourceKey)) return null;
  const width = view.getUint16(4, true);
  const height = view.getUint16(6, true);
  if (width === 0 || height === 0 || bytes.byteLength !== HEADER + 2 * width * height) return null;
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = view.getUint16(HEADER + 2 * i, true) / 65535;
  return { width, height, data };
}
