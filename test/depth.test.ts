import { describe, expect, it } from "vitest";
import {
  DEPTH_PRESENT,
  depthSize,
  depthTexture,
  normalizeDisparity,
  resample,
  simpleDepth,
  type DepthMap,
} from "../src/depth/map";
import { STROKE_STEP, applyStrokes, readStrokes, shortHash } from "../src/depth/strokes";

const at = (m: DepthMap, x: number, y: number) => m.data[y * m.width + x];

describe("depth maps", () => {
  it("makes the simple depth far at the top and near at the bottom", () => {
    const m = simpleDepth(4, 5);
    expect(at(m, 2, 0)).toBe(0);
    expect(at(m, 2, 4)).toBe(1);
    expect(at(m, 0, 2)).toBeCloseTo(0.5, 9);
  });

  it("resamples bilinearly with texel centres aligned", () => {
    const m: DepthMap = { width: 2, height: 1, data: new Float32Array([0, 1]) };
    const r = resample(m, 4, 1);
    expect(Array.from(r.data)).toEqual([0, 0.25, 0.75, 1]);
  });

  it("spreads raw disparity between its 1st and 99th percentiles", () => {
    const raw = Float32Array.from({ length: 1001 }, (_, i) => i);
    raw[1000] = 1e6;
    const n = normalizeDisparity(raw);
    expect(n[10]).toBe(0);
    expect(n[500]).toBeCloseTo(0.5, 2);
    expect(n[1000]).toBe(1);
  });

  it("keeps a map at most 1024 px on its long edge", () => {
    expect(depthSize(6000, 4000)).toEqual({ width: 1024, height: 683 });
    expect(depthSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it("packs depth for the GPU above the mark that says it is there", () => {
    const tex = depthTexture({ width: 2, height: 1, data: new Float32Array([0, 1]) });
    expect(tex.format).toBe("r16f");
    expect(Array.from(tex.data)).toEqual([0.5, 1]);
    expect(Math.min(...tex.data)).toBeGreaterThan(DEPTH_PRESENT);
  });
});

describe("refine strokes", () => {
  const flat = (): DepthMap => ({ width: 20, height: 20, data: new Float32Array(400).fill(0.5) });

  it("reads strokes from the bag and leaves out malformed ones", () => {
    const good = { dir: 1, amount: 0.5, feather: 0.2, dabs: [0.5, 0.5, 0.1] };
    expect(readStrokes([good, { dir: 2, amount: 1, feather: 0, dabs: [] }, { ...good, dabs: [0.1, 0.2] }, null])).toEqual([good]);
    expect(readStrokes("nope")).toEqual([]);
  });

  it("moves the painted area nearer or further by the stroke's amount", () => {
    const nearer = applyStrokes(flat(), [{ dir: 1, amount: 1, feather: 0, dabs: [0.5, 0.5, 0.2] }]);
    expect(at(nearer, 10, 10)).toBeCloseTo(0.5 + STROKE_STEP, 6);
    expect(at(nearer, 0, 0)).toBe(0.5);
    const further = applyStrokes(flat(), [{ dir: -1, amount: 0.5, feather: 0, dabs: [0.5, 0.5, 0.2] }]);
    expect(at(further, 10, 10)).toBeCloseTo(0.5 - STROKE_STEP / 2, 6);
  });

  it("doesn't pile up overlapping dabs of one stroke, but does pile up strokes", () => {
    const dab = [0.5, 0.5, 0.2];
    const one = applyStrokes(flat(), [{ dir: 1, amount: 1, feather: 0, dabs: [...dab, ...dab, ...dab] }]);
    expect(at(one, 10, 10)).toBeCloseTo(0.5 + STROKE_STEP, 6);
    const two = applyStrokes(flat(), [
      { dir: 1, amount: 1, feather: 0, dabs: dab },
      { dir: 1, amount: 1, feather: 0, dabs: dab },
    ]);
    expect(at(two, 10, 10)).toBeCloseTo(0.5 + 2 * STROKE_STEP, 6);
  });

  it("fades a feathered stroke's edge", () => {
    const out = applyStrokes(flat(), [{ dir: 1, amount: 1, feather: 1, dabs: [0.5, 0.5, 0.4] }]);
    expect(at(out, 10, 10)).toBeGreaterThan(at(out, 14, 10));
    expect(at(out, 14, 10)).toBeGreaterThan(0.5);
  });

  it("names different text differently", () => {
    expect(shortHash("a")).not.toBe(shortHash("b"));
    expect(shortHash("abc")).toBe(shortHash("abc"));
  });
});
