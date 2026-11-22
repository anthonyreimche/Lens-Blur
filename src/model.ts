// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The optics, on the CPU: how blurred each depth is, the bokeh shapes, and
// the focal range a click or a drag picks. glsl.ts runs the same formulas on
// the GPU, with the constants written out from here.
//
// Depth is disparity (inverse distance), 0 the farthest and 1 the nearest the
// photo holds. A lens's circle of confusion grows with the distance from the
// focus measured in disparity, so the blur is linear in it: a radius of
// `R · (far − d) / FALLOFF` behind the focal range and the same in front,
// up to the full radius R.

import type { DepthMap } from "./depth/map";

/** The largest blur radius, as a share of the frame's long edge. */
export const LB_MAX_RADIUS = 0.025;
/** The disparity past the focal range at which the blur reaches its full radius. */
export const FALLOFF = 0.35;
/** How much brighter a value at white or above becomes at Boost 100. */
export const BOOST_GAIN = 8;
/** The max channel at which Boost starts, and where it is full. */
export const BOOST_FROM = 0.75;
export const BOOST_FULL = 1;
/** The box Boost judges a highlight's light over, as a share of the frame's
 *  long edge: two pixels at Develop's 4096 px. */
export const BOOST_SPAN = 1 / 2048;
/** The blur radius, in pixels of a 4096 px frame, over which Boost comes in:
 *  none below the first, full from the second, so what is in focus or barely
 *  blurred never brightens. */
export const BOOST_ONSET: readonly [number, number] = [1, 3];
/** The focal range a click picks, in disparity. */
export const BAND_WIDTH = 0.06;

export interface Band {
  near: number;
  far: number;
}

/** The blur radius at `amount`, in the frame's own pixels. */
export function blurRadius(amount: number, longEdge: number): number {
  return (Math.min(100, Math.max(0, amount)) / 100) * LB_MAX_RADIUS * longEdge;
}

/** The signed circle of confusion at disparity `d`: positive behind the focal
 *  range, negative in front of it, zero inside. */
export function cocOf(d: number, band: Band, radius: number): number {
  if (d < band.far) return radius * Math.min(1, (band.far - d) / FALLOFF);
  if (d > band.near) return -radius * Math.min(1, (d - band.near) / FALLOFF);
  return 0;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const circleEdge = (r: number): number => 1 - smoothstep(0.9, 1, r);

/** The cat eye's second circle: the exit pupil's shadow, shifted toward the
 *  frame's edge by `CAT_EYE` of the disc at the corners. */
export const CAT_EYE = 0.7;
/** Where the five blades' first corner points (up: the passes' y runs down
 *  the frame), and how round their edges are. */
export const BLADE_ANGLE = -Math.PI / 2;
export const BLADE_ROUND = 0.12;

/** A shape's weight at `u` (where the receiving pixel sits in the source's
 *  disc, the disc's radius 1) before its normalization. `at` is the source's
 *  place in the frame (0 to 1) and `aspect` the frame's width over height,
 *  which only the cat eye reads. */
function rawShape(shape: number, u: readonly [number, number], at: readonly [number, number], aspect: number): number {
  const r = Math.hypot(u[0], u[1]);
  if (r >= 1) return 0;
  switch (shape) {
    case 1:
      return circleEdge(r) * (0.35 + 1.65 * smoothstep(0.5, 0.95, r));
    case 2: {
      const seg = (2 * Math.PI) / 5;
      const theta = Math.atan2(u[1], u[0]) - BLADE_ANGLE;
      const phi = theta - seg * Math.floor(theta / seg) - seg / 2;
      const edge = Math.cos(seg / 2) / Math.cos(phi);
      const rr = edge + (1 - edge) * BLADE_ROUND;
      return 1 - smoothstep(0.9 * rr, rr, r);
    }
    case 3:
      return circleEdge(r) * smoothstep(0.45, 0.65, r);
    case 4: {
      const o = catEyeOffset(at, aspect);
      return Math.min(circleEdge(r), circleEdge(Math.hypot(u[0] - o[0], u[1] - o[1])));
    }
    default:
      return circleEdge(r);
  }
}

/** The cat eye's offset for a source at `at`, in disc radii. */
export function catEyeOffset(at: readonly [number, number], aspect: number): [number, number] {
  const vx = (at[0] - 0.5) * aspect;
  const vy = at[1] - 0.5;
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) return [0, 0];
  const k = Math.min(1, len / (0.5 * Math.hypot(aspect, 1)));
  return [(vx / len) * k * CAT_EYE, (vy / len) * k * CAT_EYE];
}

/** The share of a unit disc two unit discs `d` apart have in common. */
export function lensShare(d: number): number {
  if (d >= 2) return 0;
  return (2 * Math.acos(d / 2) - (d / 2) * Math.sqrt(4 - d * d)) / Math.PI;
}

/** Each shape's mean weight over the unit disc, measured once. */
function meanOverDisc(shape: number): number {
  const steps = 240;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const u: [number, number] = [((i + 0.5) / steps) * 2 - 1, ((j + 0.5) / steps) * 2 - 1];
      if (u[0] * u[0] + u[1] * u[1] >= 1) continue;
      sum += rawShape(shape, u, [0.5, 0.5], 1);
      n++;
    }
  }
  return sum / n;
}

/** 1 / the mean weight of each shape (the cat eye's at the frame's centre). */
export const SHAPE_NORM: readonly number[] = [0, 1, 2, 3, 4].map((s) => 1 / meanOverDisc(s));

/** A shape's weight at `u`, normalized so its disc carries the light a full
 *  disc does: Bubble and Ring move light within the disc, and the cat eye,
 *  whose disc narrows toward the frame's edge, keeps its brightness. */
export function shapeWeight(shape: number, u: readonly [number, number], at: readonly [number, number], aspect: number): number {
  const w = rawShape(shape, u, at, aspect) * SHAPE_NORM[shape];
  if (shape !== 4 || w === 0) return w;
  const o = catEyeOffset(at, aspect);
  return w / Math.max(0.05, lensShare(Math.hypot(o[0], o[1])));
}

const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/** A focal range `width` wide centred on `d`, moved inside 0 to 1. */
export function bandAround(d: number, width: number): Band {
  const w = Math.min(1, Math.max(0, width));
  let near = d + w / 2;
  let far = d - w / 2;
  if (near > 1) {
    near = 1;
    far = 1 - w;
  } else if (far < 0) {
    far = 0;
    near = w;
  }
  return { near: round4(near), far: round4(far) };
}

/** The focal range for an area's depths: its 10th to 90th percentile, at
 *  least BAND_WIDTH wide. */
export function bandFromSamples(samples: readonly number[]): Band {
  if (samples.length === 0) return bandAround(0.5, BAND_WIDTH);
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))];
  const far = at(0.1);
  const near = at(0.9);
  if (near - far < BAND_WIDTH) return bandAround((near + far) / 2, BAND_WIDTH);
  return { near: round4(near), far: round4(far) };
}

/** The depths of `map` inside the box (0 to 1 of the frame). */
export function samplesIn(map: DepthMap, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  const ax = Math.max(0, Math.floor(Math.min(x0, x1) * map.width));
  const bx = Math.min(map.width, Math.ceil(Math.max(x0, x1) * map.width));
  const ay = Math.max(0, Math.floor(Math.min(y0, y1) * map.height));
  const by = Math.min(map.height, Math.ceil(Math.max(y0, y1) * map.height));
  const step = Math.max(1, Math.floor(Math.sqrt(((bx - ax) * (by - ay)) / 4096)));
  for (let y = ay; y < by; y += step) for (let x = ax; x < bx; x += step) out.push(map.data[y * map.width + x]);
  return out;
}

/** A new photo's focal range: the depth at the middle of the frame. */
export function autoBand(map: DepthMap): Band {
  const samples = samplesIn(map, 0.35, 0.35, 0.65, 0.65).sort((a, b) => a - b);
  return bandAround(samples[Math.floor(samples.length / 2)] ?? 0.5, BAND_WIDTH);
}

/** The share of the map's texels at each depth, `bins` of them from the
 *  nearest (bin 0) to the farthest. */
export function depthHistogram(map: DepthMap, bins: number): number[] {
  const out = new Array<number>(bins).fill(0);
  const n = map.data.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const x = 1 - Math.min(1, Math.max(0, map.data[i]));
    out[Math.min(bins - 1, Math.floor(x * bins))] += 1 / n;
  }
  return out;
}
