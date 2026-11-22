// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The GPU side. Four passes over one four-channel target, in the stage's
// linear Rec. 709, then the inline blend.
//
//   base    level 1 of two pyramids of the image as edited up to the stage,
//           Boost applied: the background pyramid in the top half of the
//           target, its texels leaning to the farther of the four they
//           merge, and the foreground pyramid in the bottom half, leaning to
//           the nearer. Alpha carries the disparity.
//   levels  one draw per further level, each half the last (kept: dragging
//           the focus or the shape draws only the gather again).
//   gather  per pixel: the background field, gathered over the pixel's own
//           circle of confusion from taps that reach it (a tap farther than
//           the pixel spreads no wider than the pixel does, so a blurred
//           background never washes over a sharp subject), and the
//           foreground field, gathered from the nearer taps around whose
//           discs cover the pixel (so a blurred foreground spills over sharp
//           edges). Taps read the pyramid level whose texels are about as
//           far apart as the taps, filtered, so no tile of the pyramid shows;
//           a background tap nearer than the pixel (a filtered read across a
//           sharp subject's edge blends the subject in) counts for less the
//           nearer it is. Out: the colour, and in alpha how much of it
//           replaces the pixel (0 where nothing blurs it).
//   smooth  the tap pattern turns from pixel to pixel (interleaved gradient
//           noise), so what few taps leave is fine grain: a tent over every
//           other pixel takes it out of the blurred colour and of how much
//           of it is laid over the photo, averaged as the colour each pixel
//           adds (its alpha times its colour) among neighbours laid over as
//           much: one fully replaced beside one half laid over would let the
//           sharp photo back in. It never reaches a pixel nothing blurs.
//
// The pyramid lives in the target itself, so every draw is full size: the
// framework has no smaller targets. Depth comes from the stage's "depth"
// texture: 0.5 + disparity / 2, or black (no map yet), which leaves the photo
// as it is. Reads in loops are explicit-gradient or fetches only, so ANGLE on
// D3D11 keeps the branches around them.

import { BLADE_ANGLE, BLADE_ROUND, BOOST_FROM, BOOST_FULL, BOOST_GAIN, BOOST_ONSET, BOOST_SPAN, CAT_EYE, FALLOFF, LB_MAX_RADIUS, SHAPE_NORM } from "./model";

const f = (v: number): string => {
  const s = v.toPrecision(9);
  return /[.e]/.test(s) ? s : `${s}.0`;
};

/** The most pyramid levels: level 1 and one draw for each further one. */
export const MAX_LEVELS = 8;
/** Taps per field, each from the pyramid level whose texels are about as far
 *  apart as the taps (level 1 at least: a blur under two pixels is mostly
 *  the sharp pixel, which the inline mixes back in). */
export const TAPS = 16;
/** The long edge, in pixels, the blur's onset is measured against:
 *  Develop's default render resolution. */
export const REF_EDGE = 4096;

/** Shared by every pass. No uniform of the stage's: each pass declares only its own. */
export const PASS_HELPERS = `precision highp int;
ivec2 lbFrame() { return ivec2(floor(1.0 / uTexel + 0.5)); }
int lbHalf() { return lbFrame().y / 2; }
ivec2 lbSize(int l) {
  ivec2 fr = ivec2(lbFrame().x, 2 * lbHalf());
  int s = 1 << l;
  return max((fr + s - 1) / s, ivec2(1));
}
ivec2 lbOrigin(int l) {
  if (l <= 1) return ivec2(0);
  ivec2 o = ivec2(lbSize(1).x, 0);
  for (int k = 2; k <= ${MAX_LEVELS}; k++) {
    if (k >= l) break;
    o.y += lbSize(k).y;
  }
  return o;
}
bool lbFits(int l) {
  ivec2 e = lbOrigin(l) + lbSize(l);
  return e.x <= lbFrame().x && e.y <= lbHalf();
}
bool lbPresent() { return texelFetch(depth, ivec2(0), 0).r > 0.25; }
float lbDisparity(vec2 pc) { return clamp(2.0 * textureLod(depth, pc * uTexel, 0.0).r - 1.0, 0.0, 1.0); }
vec4 lbMerge(vec4 a, vec4 b, vec4 c, vec4 d, bool fg) {
  float lo = min(min(a.a, b.a), min(c.a, d.a));
  float hi = max(max(a.a, b.a), max(c.a, d.a));
  vec4 w = exp2(-abs(vec4(a.a, b.a, c.a, d.a) - (fg ? hi : lo)) * 40.0);
  return (w.x * a + w.y * b + w.z * c + w.w * d) / (w.x + w.y + w.z + w.w);
}
`;

/** Boost's gain for the 2×2 block centred on `centre`, judged on the mean of
 *  a box BOOST_SPAN of the frame's long edge wide (two pixels at least): a
 *  fixed share of the frame, so a preview, whose source Safelight averaged
 *  down from the photo's, and a full-size export judge the same light. Judged
 *  pixel by pixel, the export's noise and fine highlights crossed the
 *  threshold far more often than the preview's averaged pixels did. */
const BASE_HELPERS = `
float lbBoostGain(vec2 centre, float boostV) {
  if (boostV <= 0.0) return 1.0;
  vec2 fr = vec2(lbFrame());
  float span = max(2.0, max(fr.x, fr.y) * ${f(BOOST_SPAN)});
  ivec2 last = lbFrame() - 1;
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 p = centre + (vec2(float(i), float(j)) - 1.5) * 0.25 * span;
      sum += fetchInput(clamp(ivec2(floor(p)), ivec2(0), last));
    }
  }
  vec3 m = sum / 16.0;
  float t = smoothstep(${f(BOOST_FROM)}, ${f(BOOST_FULL)}, max(m.r, max(m.g, m.b)));
  return 1.0 + ${f(BOOST_GAIN - 1)} * boostV / 100.0 * t;
}
`;

const GATHER_HELPERS = `
float lbGainOf(float boostedMax, float boostV) {
  float c = ${f(BOOST_GAIN - 1)} * boostV / 100.0;
  if (c <= 0.0 || boostedMax <= ${f(BOOST_FROM)}) return 1.0;
  if (boostedMax >= ${f(BOOST_FULL)} * (1.0 + c)) return 1.0 + c;
  float lo = ${f(BOOST_FROM)};
  float hi = ${f(BOOST_FULL)};
  for (int i = 0; i < 12; i++) {
    float m = 0.5 * (lo + hi);
    if (m * (1.0 + c * smoothstep(${f(BOOST_FROM)}, ${f(BOOST_FULL)}, m)) < boostedMax) lo = m;
    else hi = m;
  }
  return boostedMax / (0.5 * (lo + hi));
}
// A tap as the base pass boosted it, with that boost kept by keep (0 to
// 1): the gain is read back from the tap's brightest channel, exactly for an
// even area, so a barely blurred bright sky isn't brightened.
vec4 lbKeepBoost(vec4 t, float keep, float boostV) {
  if (keep >= 1.0 || boostV <= 0.0) return t;
  float g = lbGainOf(max(t.r, max(t.g, t.b)), boostV);
  return vec4(t.rgb / mix(g, 1.0, keep), t.a);
}
float lbCoc(float d, float nearD, float farD, float radius) {
  if (d < farD) return radius * min(1.0, (farD - d) / ${f(FALLOFF)});
  if (d > nearD) return -radius * min(1.0, (d - nearD) / ${f(FALLOFF)});
  return 0.0;
}
int lbTop(float amountV) {
  int built = 1 + int(clamp(floor(amountV + 0.5), 0.0, ${f(MAX_LEVELS - 1)}));
  int top = 1;
  for (int l = 2; l <= ${MAX_LEVELS}; l++) {
    if (l > built || !lbFits(l)) break;
    top = l;
  }
  return top;
}
int lbLevel(float r, int top) {
  float spacing = r * ${f(Math.sqrt(Math.PI / TAPS))};
  return clamp(int(floor(log2(max(spacing, 1.0)))), 1, top);
}
vec4 lbTap(vec2 pc, ivec2 origin, ivec2 size, float scale) {
  vec2 t = clamp(pc / scale - 0.5, vec2(0.0), vec2(size - 1));
  return readPrev4((vec2(origin) + t + 0.5) * uTexel);
}
float lbNoise(ivec2 q) {
  vec2 p = vec2(q % 4096);
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
vec2 lbVogel(int i, int n, float rot) {
  float r = sqrt((float(i) + 0.5) / float(n));
  float th = float(i) * 2.39996323 + rot;
  return r * vec2(cos(th), sin(th));
}
float lbEdge(float r) { return 1.0 - smoothstep(0.9, 1.0, r); }
vec2 lbCatEye(vec2 at, float aspect) {
  vec2 v = vec2((at.x - 0.5) * aspect, at.y - 0.5);
  float len = length(v);
  if (len < 1e-6) return vec2(0.0);
  float k = min(1.0, len / (0.5 * length(vec2(aspect, 1.0))));
  return v / len * k * ${f(CAT_EYE)};
}
float lbLensShare(float d) {
  if (d >= 2.0) return 0.0;
  return (2.0 * acos(d * 0.5) - d * 0.5 * sqrt(4.0 - d * d)) / 3.14159265;
}
float lbShape(int shapeV, vec2 u, vec2 at, float aspect) {
  float r = length(u);
  if (r >= 1.0) return 0.0;
  if (shapeV == 1) return lbEdge(r) * (0.35 + 1.65 * smoothstep(0.5, 0.95, r)) * ${f(SHAPE_NORM[1])};
  if (shapeV == 2) {
    if (r < 1e-4) return ${f(SHAPE_NORM[2])};
    float seg = ${f((2 * Math.PI) / 5)};
    float th = atan(u.y, u.x) - ${f(BLADE_ANGLE)};
    float phi = th - seg * floor(th / seg) - seg * 0.5;
    float edge = cos(seg * 0.5) / cos(phi);
    float rr = edge + (1.0 - edge) * ${f(BLADE_ROUND)};
    return (1.0 - smoothstep(0.9 * rr, rr, r)) * ${f(SHAPE_NORM[2])};
  }
  if (shapeV == 3) return lbEdge(r) * smoothstep(0.45, 0.65, r) * ${f(SHAPE_NORM[3])};
  if (shapeV == 4) {
    vec2 o = lbCatEye(at, aspect);
    float w = min(lbEdge(r), lbEdge(length(u - o))) * ${f(SHAPE_NORM[4])};
    return w > 0.0 ? w / max(0.05, lbLensShare(length(o))) : 0.0;
  }
  return lbEdge(r) * ${f(SHAPE_NORM[0])};
}
void lbBackTap(vec4 t, vec2 off, vec2 at, float cp, float dp, float nearD, float farD, float radius, int shapeV, float aspect, inout vec3 sum, inout float wsum) {
  float cq = lbCoc(t.a, nearD, farD, radius);
  if (cq < 0.0) return;
  if (cp < 0.0) {
    float hw = exp2(-40.0 * max(t.a - farD, 0.0));
    sum += hw * t.rgb;
    wsum += hw;
    return;
  }
  float rq = max(t.a < dp ? min(cq, cp) : cq, 1e-3);
  // A filtered read across a sharp subject's edge blends its colour and depth
  // into the tap; one nearer than the pixel counts for less the nearer it is.
  float w = lbShape(shapeV, off / rq, at, aspect) / max(rq * rq, 1.0) * exp2(-40.0 * max(t.a - dp, 0.0));
  sum += w * t.rgb;
  wsum += w;
}
void lbFrontTap(vec4 t, vec2 off, vec2 at, float area, float nearD, float farD, float radius, int shapeV, float aspect, inout vec3 sum, inout float cover) {
  float cq = lbCoc(t.a, nearD, farD, radius);
  if (cq >= 0.0) return;
  float rq = -cq;
  float w = lbShape(shapeV, off / rq, at, aspect) * area / max(rq * rq, 0.25);
  sum += w * t.rgb;
  cover += w;
}
`;

const BASE = `
ivec2 q = ivec2(gl_FragCoord.xy);
int hh = lbHalf();
bool fg = q.y >= hh;
ivec2 a = ivec2(q.x, fg ? q.y - hh : q.y);
ivec2 s1 = lbSize(1);
c = vec4(0.0);
if (q.y < 2 * hh && a.x < s1.x && a.y < s1.y) {
  ivec2 fr = lbFrame() - 1;
  ivec2 p0 = min(2 * a, fr);
  ivec2 p1 = min(2 * a + ivec2(1, 0), fr);
  ivec2 p2 = min(2 * a + ivec2(0, 1), fr);
  ivec2 p3 = min(2 * a + ivec2(1, 1), fr);
  float g = lbBoostGain(vec2(2 * a) + 1.0, boost);
  c = lbMerge(
    vec4(g * fetchInput(p0), lbDisparity(vec2(p0) + 0.5)),
    vec4(g * fetchInput(p1), lbDisparity(vec2(p1) + 0.5)),
    vec4(g * fetchInput(p2), lbDisparity(vec2(p2) + 0.5)),
    vec4(g * fetchInput(p3), lbDisparity(vec2(p3) + 0.5)),
    fg);
}
`;

const LEVELS = `
ivec2 q = ivec2(gl_FragCoord.xy);
int hh = lbHalf();
int l = uPassIndex + 2;
bool fg = q.y >= hh;
ivec2 a = ivec2(q.x, fg ? q.y - hh : q.y);
ivec2 o = lbOrigin(l);
if (q.y < 2 * hh && lbFits(l) && all(greaterThanEqual(a, o)) && all(lessThan(a, o + lbSize(l)))) {
  ivec2 k = 2 * (a - o);
  ivec2 po = lbOrigin(l - 1) + ivec2(0, fg ? hh : 0);
  ivec2 last = lbSize(l - 1) - 1;
  c = lbMerge(
    fetchPrev4(po + min(k, last)),
    fetchPrev4(po + min(k + ivec2(1, 0), last)),
    fetchPrev4(po + min(k + ivec2(0, 1), last)),
    fetchPrev4(po + min(k + ivec2(1, 1), last)),
    fg);
}
`;

const GATHER = `
ivec2 q = ivec2(gl_FragCoord.xy);
vec3 sharp = fetchInput(q);
c = vec4(sharp, 0.0);
if (lbPresent()) {
  vec2 fr = vec2(lbFrame());
  float aspect = fr.x / fr.y;
  float radius = amount / 100.0 * ${f(LB_MAX_RADIUS)} * max(fr.x, fr.y);
  int top = lbTop(amount);
  vec2 pc = vec2(q) + 0.5;
  float dp = lbDisparity(pc);
  float cp = lbCoc(dp, near, far, radius);
  float rot = lbNoise(q) * 6.28318531;
  int hh = lbHalf();

  // Where blurring begins is a share of the frame, not a pixel count: a
  // circle under a pixel in Develop's preview is over one in a full-size
  // export, and the two must blend (and boost) the same.
  float toRef = ${f(REF_EDGE)} / max(fr.x, fr.y);
  float rb = abs(cp);
  vec3 back = sharp;
  float wBack = 0.0;
  if (rb * toRef >= 0.5) {
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    float keep = smoothstep(${f(BOOST_ONSET[0])}, ${f(BOOST_ONSET[1])}, rb * toRef);
    int l = lbLevel(rb, top);
    ivec2 o = lbOrigin(l);
    ivec2 s = lbSize(l);
    float sc = exp2(float(l));
    for (int i = 0; i < ${TAPS}; i++) {
      vec2 off = rb * lbVogel(i, ${TAPS}, rot);
      vec2 pq = pc - off;
      lbBackTap(lbKeepBoost(lbTap(pq, o, s, sc), keep, boost), off, pq / fr, cp, dp, near, far, radius, shape, aspect, sum, wsum);
    }
    if (wsum > 1e-6) back = sum / wsum;
    wBack = smoothstep(0.5, 1.5, rb * toRef);
  }

  float rf = max(-cp, 0.0);
  {
    // The nearest depth within the full radius, from the four foreground
    // texels around the pixel at the level whose texels are at least that
    // wide: a soft maximum under their bilinear weights, so it changes
    // smoothly from pixel to pixel instead of from tile to tile (a search
    // radius that jumps at tile edges left seams in the blur).
    int ln = clamp(int(ceil(log2(max(radius, 2.0)))), 1, top);
    ivec2 on = lbOrigin(ln) + ivec2(0, hh);
    ivec2 last = lbSize(ln) - 1;
    vec2 t = pc / exp2(float(ln)) - 0.5;
    ivec2 k = ivec2(floor(t));
    vec2 fk = t - floor(t);
    vec4 dk = vec4(
      fetchPrev4(on + clamp(k, ivec2(0), last)).a, fetchPrev4(on + clamp(k + ivec2(1, 0), ivec2(0), last)).a,
      fetchPrev4(on + clamp(k + ivec2(0, 1), ivec2(0), last)).a, fetchPrev4(on + clamp(k + ivec2(1, 1), ivec2(0), last)).a);
    vec4 wk = vec4((1.0 - fk.x) * (1.0 - fk.y), fk.x * (1.0 - fk.y), (1.0 - fk.x) * fk.y, fk.x * fk.y) * exp2(12.0 * (dk - max(max(dk.x, dk.y), max(dk.z, dk.w))));
    float dn = dot(wk, dk) / max(wk.x + wk.y + wk.z + wk.w, 1e-6);
    rf = max(rf, -lbCoc(max(dn, dp), near, far, radius));
  }
  vec3 front = sharp;
  float aFront = 0.0;
  if (rf * toRef >= 0.5) {
    vec3 sum = vec3(0.0);
    float cover = 0.0;
    float keep = smoothstep(${f(BOOST_ONSET[0])}, ${f(BOOST_ONSET[1])}, rf * toRef);
    int l = max(1, lbLevel(radius, top) - 2);
    ivec2 o = lbOrigin(l) + ivec2(0, hh);
    ivec2 s = lbSize(l);
    float sc = exp2(float(l));
    float area = rf * rf / ${f(TAPS)};
    for (int i = 0; i < ${TAPS}; i++) {
      vec2 off = rf * lbVogel(i, ${TAPS}, rot);
      vec2 pq = pc - off;
      lbFrontTap(lbKeepBoost(lbTap(pq, o, s, sc), keep, boost), off, pq / fr, area, near, far, radius, shape, aspect, sum, cover);
    }
    if (cover > 1e-6) front = sum / cover;
    aFront = clamp(cover, 0.0, 1.0);
  }

  float take = 1.0 - (1.0 - wBack) * (1.0 - aFront);
  vec3 blurred = take > 1e-5 ? (back * wBack * (1.0 - aFront) + front * aFront) / take : sharp;
  c = vec4(blurred, take);
}
`;

const SMOOTH = `
ivec2 q = ivec2(gl_FragCoord.xy);
if (c.a > 0.0) {
  ivec2 last = lbFrame() - 1;
  vec3 sum = vec3(0.0);
  float cover = 0.0;
  float wsum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec4 n = fetchPrev4(clamp(q + 2 * ivec2(i, j), ivec2(0), last));
      float w = (i == 0 && j == 0 ? 4.0 : i == 0 || j == 0 ? 2.0 : 1.0) * exp2(-8.0 * abs(n.a - c.a));
      sum += w * n.a * n.rgb;
      cover += w * n.a;
      wsum += w;
    }
  }
  c = vec4(sum / max(cover, 1e-6), cover / wsum);
}
`;

export interface PassSource {
  name: string;
  glsl: string;
  helpers: string;
}

export const PASSES: readonly PassSource[] = [
  { name: "base", glsl: BASE, helpers: PASS_HELPERS + BASE_HELPERS },
  { name: "levels", glsl: LEVELS, helpers: PASS_HELPERS },
  { name: "gather", glsl: GATHER, helpers: PASS_HELPERS + GATHER_HELPERS },
  { name: "smooth", glsl: SMOOTH, helpers: PASS_HELPERS },
];

/** The depth view: warm near, cool far, the focal range lit. */
export const INLINE_HELPERS = `
vec3 lbDepthColour(float d, float nearD, float farD) {
  vec3 tint = mix(vec3(0.02, 0.1, 0.55), vec3(0.9, 0.35, 0.06), d);
  return d >= farD && d <= nearD ? mix(tint, vec3(1.0), 0.55) : tint;
}
`;

/** The inline block, reading the gather's alpha through the result sampler
 *  `result` (the host's name for it, stage.ts). */
export function inlineGlsl(result: string): string {
  return `
float lbRaw = texture(depth, srcUv).r;
bool lbOk = texelFetch(depth, ivec2(0), 0).r > 0.25 && lbRaw > 0.25;
if (view > 0.5 && lbOk) {
  lin = lbDepthColour(clamp(2.0 * lbRaw - 1.0, 0.0, 1.0), near, far);
} else if (amount >= 0.5 && lbOk) {
  vec4 lbOut = texture(${result}, srcUv);
  lin = mix(lin, lbOut.rgb, clamp(lbOut.a, 0.0, 1.0));
}
`;
}
