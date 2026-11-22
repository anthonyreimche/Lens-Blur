// The stage as registered, and the GLSL it carries: the per-draw fetch budget
// (what a GPU watchdog sees), the precision guard Mesa's radeonsi needs, and
// decimals on every float constant written out from the model.

import { describe, expect, it } from "vitest";
import { INLINE_HELPERS, MAX_LEVELS, PASSES, PASS_HELPERS, TAPS, inlineGlsl } from "../src/glsl";
import { DEPTH_KEY, STAGE_ID, UNIFORM_KEYS } from "../src/params";
import { lensBlurStage, resultSampler } from "../src/stage";
import { fetchBudget, inlineFetches } from "./support/fetch-budget";

const stage = lensBlurStage();

describe("the stage", () => {
  it("works on scene-linear values, on the image as edited up to it", () => {
    expect(stage.id).toBe(STAGE_ID);
    expect(stage.phase).toBe("scene-linear");
    expect(stage.reads).toBe("current");
    expect(stage.space).toEqual({ encoding: "linear", primaries: "rec709" });
    expect(stage.presetScope).toBe("per-image");
  });

  it("declares every value the bag keeps, and the depth map as a texture of each photo's own", () => {
    expect(stage.uniforms.map((u) => u.key)).toEqual([...UNIFORM_KEYS]);
    expect(stage.textures).toEqual([{ key: DEPTH_KEY, kind: "dynamic", perPhoto: true }]);
  });

  it("rests at amount 0 with the depth view off", () => {
    expect(stage.dormantWhen).toEqual({ amount: 0, view: 0 });
  });

  it("draws its passes only from amount 0.5, a pyramid level more for each further point up to the last", () => {
    expect(stage.passes?.map((p) => p.iterations)).toEqual([
      { key: "amount", max: 1 },
      { key: "amount", max: MAX_LEVELS - 1 },
      { key: "amount", max: 1 },
      { key: "amount", max: 1 },
    ]);
  });

  it("keeps the pyramid, so a focus or shape drag draws only the gather again", () => {
    expect(stage.passes?.map((p) => p.keep === true)).toEqual([false, true, false, false]);
    const gatherKeys = stage.passes?.[2].uniforms?.map((u) => u.key);
    expect(gatherKeys).toEqual(["amount", "near", "far", "shape", "boost"]);
    expect(stage.passes?.[1].uniforms ?? []).toEqual([]);
  });

  it("names the host's result sampler for the stage", () => {
    expect(resultSampler(STAGE_ID)).toMatch(/^u_[0-9a-z]{1,4}_stageResult$/);
    expect(stage.glsl).toContain(resultSampler(STAGE_ID));
  });
});

describe("the GLSL", () => {
  it("keeps every draw within 41 fetches a pixel, every branch counted", () => {
    const budgets = PASSES.map((p) => fetchBudget(p.glsl, p.helpers));
    expect(budgets).toEqual([25, 5, 2 * TAPS + 8, 10]);
    expect(Math.max(...budgets)).toBeLessThanOrEqual(41);
  });

  it("reads three fetches inline", () => {
    expect(inlineFetches(inlineGlsl("u_x_stageResult"), INLINE_HELPERS)).toBe(3);
  });

  it("leads the pass helpers with highp ints, which the pyramid's index sums need", () => {
    for (const p of PASSES) expect(p.helpers.startsWith("precision highp int;")).toBe(true);
    expect(PASS_HELPERS).toContain("1 << l");
  });

  it("writes every float constant with a decimal point", () => {
    const src = [...PASSES.map((p) => p.glsl + p.helpers), INLINE_HELPERS, inlineGlsl("u_x_stageResult")].join("\n");
    expect(src).not.toMatch(/\b(?:float|const float)\s+\w+\s*=\s*-?\d+\s*;/);
    expect(src).not.toMatch(/\d\.\d*e[+-]?\d+(?![\d.])/);
    expect(src).not.toMatch(/NaN|Infinity|undefined/);
  });
});
