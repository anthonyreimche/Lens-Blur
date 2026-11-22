// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// Refining the depth by hand: strokes painted nearer or further, kept in the
// photo's param bag (so they undo, copy and export with the edit) and laid
// over the estimated map before it goes to the GPU.

import type { DepthMap } from "./map";

/** One stroke: its dabs as flat [x, y, r, …] triples, x and y 0 to 1 across
 *  the decoded source and r a share of its height, as core's brush dabs are. */
export interface DepthStroke {
  /** 1 paints nearer, −1 further. */
  dir: 1 | -1;
  /** 0 to 1: how far one stroke moves the depth, at most STROKE_STEP. */
  amount: number;
  /** 0 to 1: the share of the radius the edge fades over. */
  feather: number;
  dabs: number[];
}

/** How far a full-strength stroke moves the depth, in disparity. */
export const STROKE_STEP = 0.25;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The strokes a bag value holds; anything malformed is left out. */
export function readStrokes(value: unknown): DepthStroke[] {
  if (!Array.isArray(value)) return [];
  const out: DepthStroke[] = [];
  for (const s of value) {
    if (typeof s !== "object" || s === null) continue;
    const { dir, amount, feather, dabs } = s as Partial<Record<keyof DepthStroke, unknown>>;
    if ((dir !== 1 && dir !== -1) || !isNum(amount) || !isNum(feather) || !Array.isArray(dabs)) continue;
    if (dabs.length % 3 !== 0 || !dabs.every(isNum)) continue;
    out.push({ dir, amount: Math.min(1, Math.max(0, amount)), feather: Math.min(1, Math.max(0, feather)), dabs });
  }
  return out;
}

/** A stroke's coverage at a distance `t` radii from a dab's centre. */
function dabCoverage(t: number, feather: number): number {
  if (t >= 1) return 0;
  const inner = 1 - feather;
  if (t <= inner) return 1;
  const s = (t - inner) / (1 - inner);
  return 1 - s * s * (3 - 2 * s);
}

/** `map` with `strokes` laid over it, in order. Within one stroke the dabs
 *  don't add up: the stroke moves each texel by its most covering dab. */
export function applyStrokes(map: DepthMap, strokes: readonly DepthStroke[]): DepthMap {
  if (strokes.length === 0) return map;
  const { width, height } = map;
  const data = Float32Array.from(map.data);
  const cover = new Float32Array(width * height);
  for (const stroke of strokes) {
    cover.fill(0);
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let k = 0; k + 2 < stroke.dabs.length; k += 3) {
      const cx = stroke.dabs[k] * width - 0.5;
      const cy = stroke.dabs[k + 1] * height - 0.5;
      const rad = Math.max(0.5, stroke.dabs[k + 2] * height);
      const ax = Math.max(0, Math.floor(cx - rad));
      const bx = Math.min(width - 1, Math.ceil(cx + rad));
      const ay = Math.max(0, Math.floor(cy - rad));
      const by = Math.min(height - 1, Math.ceil(cy + rad));
      x0 = Math.min(x0, ax);
      y0 = Math.min(y0, ay);
      x1 = Math.max(x1, bx);
      y1 = Math.max(y1, by);
      for (let y = ay; y <= by; y++) {
        for (let x = ax; x <= bx; x++) {
          const c = dabCoverage(Math.hypot(x - cx, y - cy) / rad, stroke.feather);
          const i = y * width + x;
          if (c > cover[i]) cover[i] = c;
        }
      }
    }
    const step = stroke.dir * stroke.amount * STROKE_STEP;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x;
        if (cover[i] > 0) data[i] = Math.min(1, Math.max(0, data[i] + step * cover[i]));
      }
    }
  }
  return { width, height, data };
}

/** A short hash of `text` (FNV-1a, base 36), for naming what it describes. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** A dab rounded for the bag: enough for a texel of an 8K frame, and short. */
export const roundDab = (v: number): number => Math.round(v * 1e5) / 1e5;
