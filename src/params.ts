// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The extension's ids and the photo's values, as the param bag keeps them.

export const EXT_ID = "lens-blur";
export const STAGE_ID = `${EXT_ID}.blur`;

/** The uniforms the stage declares; the bag keeps them under "{STAGE_ID}.{key}". */
export const UNIFORM_KEYS = ["amount", "near", "far", "shape", "boost", "view"] as const;
export type UniformKey = (typeof UNIFORM_KEYS)[number];

/** The stage texture the depth map is drawn from, one variant per photo,
 *  named by the photo's id (perPhoto). */
export const DEPTH_KEY = "depth";
/** How the photo's depth is made, a DepthMethod (estimator.ts); absent until
 *  it has one. */
export const METHOD_KEY = "method";
/** The refine strokes, a DepthStroke[] (strokes.ts), beside the uniforms. */
export const REFINE_KEY = "refine";

export const qualified = (key: string): string => `${STAGE_ID}.${key}`;

export const PARAM = {
  amount: qualified("amount"),
  near: qualified("near"),
  far: qualified("far"),
  shape: qualified("shape"),
  boost: qualified("boost"),
  view: qualified("view"),
  method: qualified(METHOD_KEY),
  refine: qualified(REFINE_KEY),
} as const;

/** Bokeh shapes, by the int the shader takes. */
export const SHAPES = ["circle", "bubble", "blade5", "ring", "cateye"] as const;
export type Shape = (typeof SHAPES)[number];

export interface Params {
  /** 0 to 100: the largest blur, as a share of LB_MAX_RADIUS. */
  amount: number;
  /** The focal range's near edge, as disparity (0 far, 1 near). */
  near: number;
  /** Its far edge; never above `near`. */
  far: number;
  shape: number;
  /** 0 to 100: how much brighter near-white values are before they blur. */
  boost: number;
}

export const DEFAULTS: Params = { amount: 0, near: 1, far: 0.94, shape: 0, boost: 0 };

/** The amount a photo starts at when its depth is first estimated. */
export const START_AMOUNT = 50;

export const RANGES = {
  amount: { min: 0, max: 100, step: 1 },
  boost: { min: 0, max: 100, step: 1 },
} as const;

const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** The photo's values out of a bag, defaults where it holds none. */
export function readParams(bag: Readonly<Record<string, unknown>>): Params {
  const near = Math.min(1, Math.max(0, num(bag[PARAM.near], DEFAULTS.near)));
  const far = Math.min(near, Math.max(0, num(bag[PARAM.far], DEFAULTS.far)));
  return {
    amount: Math.min(100, Math.max(0, num(bag[PARAM.amount], DEFAULTS.amount))),
    near,
    far,
    shape: Math.min(SHAPES.length - 1, Math.max(0, Math.round(num(bag[PARAM.shape], DEFAULTS.shape)))),
    boost: Math.min(100, Math.max(0, num(bag[PARAM.boost], DEFAULTS.boost))),
  };
}

/** How the bag's photo has its depth made, or null before it has one. */
export function methodOf(bag: Readonly<Record<string, unknown> | null | undefined>): "model" | "simple" | null {
  const v = bag?.[PARAM.method];
  return v === "model" || v === "simple" ? v : null;
}
