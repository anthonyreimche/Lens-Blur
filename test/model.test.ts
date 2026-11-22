import { describe, expect, it } from "vitest";
import {
  BAND_WIDTH,
  FALLOFF,
  LB_MAX_RADIUS,
  autoBand,
  bandAround,
  bandFromSamples,
  blurRadius,
  cocOf,
  depthHistogram,
  shapeWeight,
} from "../src/model";
import { SHAPES } from "../src/params";

const band = { near: 0.6, far: 0.5 };

describe("circle of confusion", () => {
  it("is zero inside the focal range", () => {
    for (const d of [0.5, 0.55, 0.6]) expect(cocOf(d, band, 40)).toBe(0);
  });

  it("grows behind the range, positive, and in front of it, negative, up to the full radius", () => {
    expect(cocOf(band.far - FALLOFF / 2, band, 40)).toBeCloseTo(20, 9);
    expect(cocOf(band.near + FALLOFF / 4, band, 40)).toBeCloseTo(-10, 9);
    expect(cocOf(0, band, 40)).toBe(40);
    expect(cocOf(1, { near: 0.2, far: 0.1 }, 40)).toBe(-40);
  });

  it("scales with the frame's long edge, so every size blurs the same share of it", () => {
    expect(blurRadius(100, 4096)).toBeCloseTo(LB_MAX_RADIUS * 4096, 9);
    expect(blurRadius(50, 1000) / 1000).toBeCloseTo(blurRadius(50, 8000) / 8000, 12);
    expect(blurRadius(0, 4096)).toBe(0);
  });
});

/** Mean of a shape over the unit disc, on a fine grid. */
function discMean(shape: number, at: [number, number] = [0.5, 0.5]): number {
  let sum = 0;
  let n = 0;
  const steps = 400;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const u: [number, number] = [((i + 0.5) / steps) * 2 - 1, ((j + 0.5) / steps) * 2 - 1];
      if (u[0] * u[0] + u[1] * u[1] > 1) continue;
      sum += shapeWeight(shape, u, at, 1.5);
      n++;
    }
  }
  return sum / n;
}

describe("bokeh shapes", () => {
  it("each carries the light of a full disc, so no shape brightens or darkens the blur", () => {
    for (let s = 0; s < SHAPES.length; s++) expect(discMean(s)).toBeCloseTo(1, 1);
  });

  it("reaches nothing past the disc", () => {
    for (let s = 0; s < SHAPES.length; s++) expect(shapeWeight(s, [1.02, 0], [0.5, 0.5], 1.5)).toBe(0);
  });

  it("gives the bubble a bright rim and the ring a dark centre", () => {
    const bubble = SHAPES.indexOf("bubble");
    const ring = SHAPES.indexOf("ring");
    expect(shapeWeight(bubble, [0.85, 0], [0.5, 0.5], 1.5)).toBeGreaterThan(2 * shapeWeight(bubble, [0, 0], [0.5, 0.5], 1.5));
    expect(shapeWeight(ring, [0.1, 0], [0.5, 0.5], 1.5)).toBe(0);
    expect(shapeWeight(ring, [0.8, 0], [0.5, 0.5], 1.5)).toBeGreaterThan(0);
  });

  it("cuts the five-blade disc to a pentagon", () => {
    const blade = SHAPES.indexOf("blade5");
    const between = (2 * Math.PI) / 10 - Math.PI / 2;
    const edge = [0.97 * Math.cos(between), 0.97 * Math.sin(between)] as [number, number];
    const vertex = [0, -0.9] as [number, number];
    expect(shapeWeight(blade, edge, [0.5, 0.5], 1.5)).toBe(0);
    expect(shapeWeight(blade, vertex, [0.5, 0.5], 1.5)).toBeGreaterThan(0);
  });

  it("keeps the cat eye round at the centre and clips it toward the corners", () => {
    const cat = SHAPES.indexOf("cateye");
    const circle = SHAPES.indexOf("circle");
    expect(shapeWeight(cat, [0.5, 0.3], [0.5, 0.5], 1.5)).toBeCloseTo(shapeWeight(circle, [0.5, 0.3], [0.5, 0.5], 1.5), 6);
    // At the top-right corner the eye narrows across the radius: a point out along it stays, one across it goes.
    const along = [0.62, 0.62] as [number, number];
    const across = [0.62, -0.62] as [number, number];
    expect(shapeWeight(cat, across, [0.98, 0.98], 1)).toBe(0);
    expect(shapeWeight(cat, along, [0.98, 0.98], 1)).toBeGreaterThan(0);
  });
});

describe("focal range", () => {
  it("centres a range of the given width on a depth, inside 0 to 1", () => {
    expect(bandAround(0.5, 0.1)).toEqual({ near: 0.55, far: 0.45 });
    expect(bandAround(0.98, 0.1)).toEqual({ near: 1, far: 0.9 });
    expect(bandAround(0.01, 0.1)).toEqual({ near: 0.1, far: 0 });
  });

  it("spans most of a dragged area's depths", () => {
    const samples = Array.from({ length: 101 }, (_, i) => 0.3 + (0.2 * i) / 100);
    const b = bandFromSamples(samples);
    expect(b.far).toBeCloseTo(0.32, 2);
    expect(b.near).toBeCloseTo(0.48, 2);
    expect(bandFromSamples([0.4, 0.4, 0.4]).near - bandFromSamples([0.4, 0.4, 0.4]).far).toBeCloseTo(BAND_WIDTH, 9);
  });

  it("focuses a new photo on what lies at its centre", () => {
    const w = 40;
    const h = 30;
    const data = new Float32Array(w * h).fill(0.1);
    for (let y = 10; y < 20; y++) for (let x = 14; x < 26; x++) data[y * w + x] = 0.7;
    const b = autoBand({ width: w, height: h, data });
    expect(b.far).toBeLessThanOrEqual(0.7);
    expect(b.near).toBeGreaterThanOrEqual(0.7);
  });
});

describe("depth histogram", () => {
  it("shares the map's texels out across bins from near to far", () => {
    const data = new Float32Array([1, 1, 0, 0.5]);
    const bins = depthHistogram({ width: 2, height: 2, data }, 4);
    expect(bins.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(bins[0]).toBeCloseTo(0.5, 9);
    expect(bins[3]).toBeCloseTo(0.25, 9);
  });
});
