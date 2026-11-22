// The stage on the real renderer. Run via `npm run test:gpu` (run.cjs copies
// this file into a SafeLight checkout and runs it under its headless Chromium +
// SwiftShader rig). What the CPU suite cannot check:
//  - the three passes and the inline compile with the host's namespacing, and
//    the passes sample the depth texture (core 3.2.7), its variants included;
//  - at rest, and with no depth map, the photo is untouched;
//  - a sharp subject stays sharp and takes no colour from the blurred
//    background behind it, while the background blurs and keeps its light;
//  - a blurred foreground spills over the sharp area beside it;
//  - Boost brightens a highlight's blur, and Ring hollows its disc;
//  - the blur covers the same share of the frame at twice the size;
//  - one gather draw at 4096 px, the largest radius, finishes.
//
// The timings it prints are SwiftShader (CPU) numbers.

import { describe, expect, it } from "vitest";
import { depthTexture, type DepthMap } from "@lb/depth/map";
import { DEPTH_KEY, PARAM, SHAPES, STAGE_ID } from "@lb/params";
import { lensBlurStage } from "@lb/stage";
import { CURRENT_PROCESS_VERSION } from "@/catalog/process-version";
import type { StageTextureData } from "@/extensions/types";
import { OPEN_PROBE, builtinStages, floatImage, identityParams, withRenderer, type Frame } from "@/rendering/webgl/webgl.test-support";

const DEPTH = `${STAGE_ID}.${DEPTH_KEY}`;
const LINEAR = { encoding: "linear", primaries: "rec709" } as const;
const W = 480;
const H = 320;

type Rgb = [number, number, number];

/** A scene by region, for each pixel its colour and disparity. */
type Scene = (x: number, y: number) => { rgb: Rgb; d: number };

const BG_D = 0.1;
const SUBJECT_D = 0.5;
const FG_D = 0.95;
const BAND = { [PARAM.near]: 0.53, [PARAM.far]: 0.47 };

/** A checkered far background, a red subject in focus in the middle, a flat
 *  in-focus strip on the right with a green foreground bar over its left
 *  edge, and a bright point far away. Sizes scale with the frame. */
function scene(w: number, h: number): Scene {
  const s = w / W;
  return (x, y) => {
    if (x >= 0.3 * w && x < 0.5 * w && y >= 0.3 * h && y < 0.7 * h) return { rgb: [0.8, 0.15, 0.1], d: SUBJECT_D };
    if (x >= 0.72 * w && x < 0.76 * w) return { rgb: [0.1, 0.7, 0.1], d: FG_D };
    if (x >= 0.76 * w) return { rgb: [0.3, 0.3, 0.3], d: SUBJECT_D };
    if (Math.hypot(x + 0.5 - 0.15 * w, y + 0.5 - 0.2 * h) < 3 * s) return { rgb: [1.5, 1.5, 1.5], d: BG_D };
    const check = (Math.floor(x / (3 * s)) + Math.floor(y / (3 * s))) % 2;
    return { rgb: check ? [0.45, 0.45, 0.5] : [0.08, 0.08, 0.1], d: BG_D };
  };
}

function imageOf(w: number, h: number, sc: Scene) {
  return floatImage(w, h, (x, y) => sc(x, y).rgb);
}

function depthOf(w: number, h: number, sc: Scene): StageTextureData {
  const map: DepthMap = { width: w, height: h, data: new Float32Array(w * h) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) map.data[y * w + x] = sc(x, y).d;
  return depthTexture(map);
}

interface Run {
  bag: Record<string, unknown>;
  textures?: Record<string, StageTextureData>;
  w?: number;
  h?: number;
  withStage?: boolean;
}

function render(runs: Record<string, Run>): Record<string, Frame> {
  const frames: Record<string, Frame> = {};
  for (const [name, run] of Object.entries(runs)) {
    const w = run.w ?? W;
    const h = run.h ?? H;
    const sc = scene(w, h);
    const stages = run.withStage === false ? builtinStages() : [...builtinStages(), lensBlurStage()];
    withRenderer({ stages, pipeline: OPEN_PROBE }, (r) => {
      r.setImage(imageOf(w, h, sc));
      r.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
      r.setStageTextures(run.textures ?? { [DEPTH]: depthOf(w, h, sc) });
      r.setContributedParams(run.bag);
      const t0 = performance.now();
      const f = r.readFloatFrame("scene", Infinity, LINEAR);
      if (!f) throw new Error(`no frame for ${name}`);
      console.log(`[lens-blur gpu] ${name}: ${w}×${h} in ${(performance.now() - t0).toFixed(0)} ms`);
      frames[name] = f;
    });
  }
  return frames;
}

const px = (f: Frame, x: number, y: number): Rgb => {
  const i = 4 * (y * f.width + x);
  return [f.data[i], f.data[i + 1], f.data[i + 2]];
};

function region(f: Frame, x0: number, y0: number, x1: number, y1: number): Rgb[] {
  const out: Rgb[] = [];
  for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) out.push(px(f, x, y));
  return out;
}

const mean = (rs: Rgb[], ch: number) => rs.reduce((a, r) => a + r[ch], 0) / rs.length;
const variance = (rs: Rgb[], ch: number) => {
  const m = mean(rs, ch);
  return rs.reduce((a, r) => a + (r[ch] - m) ** 2, 0) / rs.length;
};
const worstDiff = (a: Frame, b: Frame) => {
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]));
  return worst;
};

const blur = (over: Record<string, unknown> = {}) => ({ [PARAM.amount]: 100, ...BAND, ...over });

describe("Lens Blur on the GPU", () => {
  const frames = render({
    without: { bag: {}, withStage: false },
    rest: { bag: { ...BAND } },
    blurred: { bag: blur() },
    boosted: { bag: blur({ [PARAM.boost]: 100 }) },
    ring: { bag: blur({ [PARAM.shape]: SHAPES.indexOf("ring") }) },
    noDepth: { bag: blur(), textures: {} },
    // What a per-photo texture draws for photo "photo1": core names its id.
    variant: {
      bag: blur({ [DEPTH]: "photo1" }),
      textures: { [`${DEPTH}#photo1`]: depthOf(W, H, scene(W, H)) },
    },
  });
  const R = 0.025 * W;

  it("leaves the photo as it was at rest and without a depth map", () => {
    expect(worstDiff(frames.rest, frames.without)).toBeLessThan(2e-6);
    expect(worstDiff(frames.noDepth, frames.without)).toBeLessThan(2e-6);
  });

  it("keeps the subject in focus untouched, edges included", () => {
    const inside = region(frames.blurred, 0.3 * W + 1, 0.3 * H + 1, 0.5 * W - 1, 0.7 * H - 1);
    const before = region(frames.without, 0.3 * W + 1, 0.3 * H + 1, 0.5 * W - 1, 0.7 * H - 1);
    let worst = 0;
    inside.forEach((p, i) => (worst = Math.max(worst, ...p.map((v, ch) => Math.abs(v - before[i][ch])))));
    expect(worst).toBeLessThan(1e-4);
  });

  it("blurs the background and keeps its light", () => {
    const box = [0.05 * W, 0.45 * H, 0.22 * W, 0.9 * H] as const;
    const after = region(frames.blurred, ...box);
    const before = region(frames.without, ...box);
    expect(variance(after, 1)).toBeLessThan(0.05 * variance(before, 1));
    expect(Math.abs(mean(after, 1) / mean(before, 1) - 1)).toBeLessThan(0.03);
  });

  it("blurs smoothly, without the pyramid's tiles showing", () => {
    const steps: number[] = [];
    for (let y = Math.round(0.45 * H); y < Math.round(0.9 * H); y++) {
      for (let x = Math.round(0.03 * W); x < Math.round(0.24 * W); x++) steps.push(Math.abs(px(frames.blurred, x + 1, y)[1] - px(frames.blurred, x, y)[1]));
    }
    steps.sort((a, b) => a - b);
    const p99 = steps[Math.floor(0.99 * steps.length)];
    console.log(`[lens-blur gpu] background step p99 ${p99.toFixed(4)}`);
    expect(p99).toBeLessThan(0.006);
  });

  it("blurs a round foreground into a round blur, without the pyramid's squares", () => {
    // A green disc in front of a sharp grey wall: its blurred rim must be as
    // bright at every angle, not squared off along the pyramid's tiles.
    const w = 960;
    const h = 640;
    const r0 = 0.12 * h;
    const disc: Scene = (x, y) =>
      Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) < r0 ? { rgb: [0.1, 0.7, 0.1], d: FG_D } : { rgb: [0.3, 0.3, 0.3], d: SUBJECT_D };
    let f: Frame | null = null;
    withRenderer({ stages: [...builtinStages(), lensBlurStage()], pipeline: OPEN_PROBE }, (r) => {
      r.setImage(imageOf(w, h, disc));
      r.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
      r.setStageTextures({ [DEPTH]: depthOf(w, h, disc) });
      r.setContributedParams(blur());
      f = r.readFloatFrame("scene", Infinity, LINEAR);
    });
    if (!f) throw new Error("no frame");
    const frame: Frame = f;
    // Each angle's mean over a short arc and a band of radii, so the spiral's
    // grain averages out and only the outline's shape is left.
    const ring = (rad: number) =>
      Array.from({ length: 36 }, (_, i) => {
        let sum = 0;
        let n = 0;
        for (let da = -2; da <= 2; da++) {
          for (let dr = -3; dr <= 3; dr++) {
            const a = ((i * 10 + da) / 180) * Math.PI;
            const [r, g] = px(frame, Math.round(w / 2 + (rad + dr) * Math.cos(a)), Math.round(h / 2 + (rad + dr) * Math.sin(a)));
            sum += g - r;
            n++;
          }
        }
        return sum / n;
      });
    const R = 0.025 * w;
    const rims = [r0 - 0.3 * R, r0, r0 + 0.3 * R].map((rad) => {
      const v = ring(rad);
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return { m, spread: Math.max(...v) - Math.min(...v) };
    });
    console.log(`[lens-blur gpu] rim ${rims.map((x) => `${x.m.toFixed(3)}±${x.spread.toFixed(3)}`).join(" ")}`);
    for (const { spread } of rims) expect(spread).toBeLessThan(0.036);
  });

  it("doesn't wash the subject's red into the background beside it", () => {
    const beside = region(frames.blurred, 0.3 * W - 4, 0.4 * H, 0.3 * W - 1, 0.6 * H);
    const far = region(frames.blurred, 0.05 * W, 0.4 * H, 0.2 * W, 0.6 * H);
    expect(mean(beside, 0) - mean(beside, 1)).toBeLessThan(0.03);
    expect(Math.abs(mean(beside, 1) - mean(far, 1))).toBeLessThan(0.05);
  });

  it("spills the blurred foreground over the sharp strip beside it", () => {
    const edge = region(frames.blurred, 0.76 * W, 0.4 * H, 0.76 * W + 3, 0.6 * H);
    const away = region(frames.blurred, 0.76 * W + Math.ceil(R) + 4, 0.4 * H, 0.95 * W, 0.6 * H);
    expect(mean(edge, 1) - mean(edge, 0)).toBeGreaterThan(0.05);
    expect(Math.abs(mean(away, 1) - 0.3)).toBeLessThan(1e-4);
  });

  it("brightens a highlight's blur with Boost", () => {
    const box = [Math.round(0.15 * W - R), Math.round(0.2 * H - R), Math.round(0.15 * W + R), Math.round(0.2 * H + R)] as const;
    const energy = (f: Frame) => region(f, ...box).reduce((a, p) => a + p[1], 0);
    const bg = energy(frames.blurred);
    expect(energy(frames.boosted) - bg).toBeGreaterThan(0.5 * (bg - energy(frames.without)) + 1);
  });

  it("hollows a highlight's disc with the Ring shape", () => {
    const cx = Math.round(0.15 * W);
    const cy = Math.round(0.2 * H);
    const centre = region(frames.ring, cx - 1, cy - 1, cx + 1, cy + 1);
    const rim = region(frames.ring, cx + Math.round(0.8 * R) - 1, cy - 1, cx + Math.round(0.8 * R) + 1, cy + 1);
    expect(mean(rim, 1)).toBeGreaterThan(mean(centre, 1));
    const circleCentre = region(frames.blurred, cx - 1, cy - 1, cx + 1, cy + 1);
    expect(mean(circleCentre, 1)).toBeGreaterThan(mean(centre, 1));
  });

  it("draws the variant the photo's bag names", () => {
    expect(worstDiff(frames.variant, frames.blurred)).toBeLessThan(1e-5);
  });

  it("blurs the same share of the frame at twice the size", () => {
    const big = render({ big: { bag: blur(), w: 2 * W, h: 2 * H } }).big;
    // How far the foreground bar's green spills over the grey strip to its
    // right, along a row: the blur's reach scales with the frame.
    const reach = (f: Frame, scale: number) => {
      const y = Math.round(0.5 * H * scale);
      const x0 = Math.round(0.76 * W * scale);
      let n = 0;
      for (let x = x0; x < x0 + Math.round(3 * R * scale); x++) {
        const [r, g] = px(f, x, y);
        if (g - r > 0.01) n++;
      }
      return n;
    };
    expect(Math.abs(reach(big, 2) - 2 * reach(frames.blurred, 1))).toBeLessThanOrEqual(4);
  });

  it("draws a 4096 px frame at the largest radius", () => {
    const w = 4096;
    const h = 2731;
    const f = render({ large: { bag: blur(), w, h } }).large;
    expect(f.data.some((v) => Number.isNaN(v))).toBe(false);
  });

  it("boosts the same at the Develop preview's size as at an export's twice as large", () => {
    // A far, bright, noisy sky over a near, sharp ground. The preview's source
    // is the export's averaged 2×2, as Safelight caps a large photo for Develop.
    const EW = 8192;
    const EH = 2048;
    const sky = (x: number, y: number): Rgb => {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const v = 0.95 + 0.5 * (n - Math.floor(n) - 0.5);
      return [v, v, 1.05 * v];
    };
    const exportImage = floatImage(EW, EH, (x, y) => (y < EH * 0.6 ? sky(x, y) : [0.2, 0.18, 0.15]));
    const previewImage = floatImage(EW / 2, EH / 2, (x, y) => {
      const sum: Rgb = [0, 0, 0];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const p = 2 * y + dy < EH * 0.6 ? sky(2 * x + dx, 2 * y + dy) : ([0.2, 0.18, 0.15] as Rgb);
        for (let c = 0; c < 3; c++) sum[c] += p[c] / 4;
      }
      return sum;
    });
    const depth = (w: number, h: number) => {
      const map: DepthMap = { width: 256, height: 64, data: new Float32Array(256 * 64) };
      for (let y = 0; y < 64; y++) map.data.fill(y < 64 * 0.6 ? 0.05 : 0.6, y * 256, (y + 1) * 256);
      void w;
      void h;
      return depthTexture(map);
    };
    const shot = (image: ReturnType<typeof floatImage>, w: number, h: number, boost = 100) =>
      withRenderer({ stages: [...builtinStages(), lensBlurStage()], pipeline: OPEN_PROBE }, (r) => {
        r.setImage(image, 8192);
        r.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
        r.setStageTextures({ [DEPTH]: depth(w, h) });
        r.setContributedParams({ [PARAM.amount]: 50, [PARAM.near]: 0.63, [PARAM.far]: 0.57, [PARAM.boost]: boost });
        const f = r.readFloatFrame("scene", 256, LINEAR);
        if (!f) throw new Error("no frame");
        return f;
      });
    const preview = shot(previewImage, EW / 2, EH / 2);
    const exported = shot(exportImage, EW, EH);
    const skyMean = (f: Frame) => mean(region(f, 0, 0, f.width, Math.floor(f.height * 0.5)), 1);
    const plain = shot(previewImage, EW / 2, EH / 2, 0);
    console.log(
      `[lens-blur gpu] sky: unboosted ${skyMean(plain).toFixed(3)}, boosted preview ${skyMean(preview).toFixed(3)}, export ${skyMean(exported).toFixed(3)}`,
    );
    expect(skyMean(preview)).toBeGreaterThan(1.2 * skyMean(plain));
    expect(Math.abs(skyMean(exported) / skyMean(preview) - 1)).toBeLessThan(0.03);
  });

  it("boosts only what is clearly blurred, the same at a preview's size and an export's", () => {
    // A bright sky at a given depth over a dark sharp ground. Just behind the
    // focal range its circle is under a pixel at the 4096 px reference and
    // must not brighten; far behind it, it is a wide blur and must. Both the
    // same at 480 and 1920 px.
    const skyAt = (d: number): Scene => (x, y) => (y < 0.5 * H ? { rgb: [0.8, 0.82, 0.86], d } : { rgb: [0.2, 0.2, 0.2], d: SUBJECT_D });
    const at = (d: number, scale: number, boost: number) => {
      const w = W * scale;
      const h = H * scale;
      const sky = skyAt(d);
      const scene = (x: number, y: number) => sky(Math.floor(x / scale), Math.floor(y / scale));
      let f: Frame | null = null;
      withRenderer({ stages: [...builtinStages(), lensBlurStage()], pipeline: OPEN_PROBE }, (r) => {
        r.setImage(imageOf(w, h, scene), 8192);
        r.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
        r.setStageTextures({ [DEPTH]: depthOf(w, h, scene) });
        r.setContributedParams({ [PARAM.amount]: 100, ...BAND, [PARAM.boost]: boost });
        f = r.readFloatFrame("scene", 240, LINEAR);
      });
      if (!f) throw new Error("no frame");
      return mean(region(f, 0, 0, (f as Frame).width, Math.floor((f as Frame).height * 0.4)), 1);
    };
    const barely = 0.468;
    const wide = 0.2;
    const plain = at(barely, 1, 0);
    const [barelySmall, barelyLarge, wideSmall, wideLarge] = [at(barely, 1, 100), at(barely, 4, 100), at(wide, 1, 100), at(wide, 4, 100)];
    console.log(
      `[lens-blur gpu] sky boosted: barely ${barelySmall.toFixed(3)}/${barelyLarge.toFixed(3)} (plain ${plain.toFixed(3)}), wide ${wideSmall.toFixed(3)}/${wideLarge.toFixed(3)}`,
    );
    expect(Math.abs(barelySmall / plain - 1)).toBeLessThan(0.02);
    expect(Math.abs(barelyLarge / plain - 1)).toBeLessThan(0.02);
    expect(wideSmall).toBeGreaterThan(2 * plain);
    expect(Math.abs(wideLarge / wideSmall - 1)).toBeLessThan(0.05);
  });
});
