// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The processing stage. A lens blurs the light before it reaches the sensor,
// so the stage works on scene-linear values, early in the scene-linear phase,
// on the image as edited up to it (white balance and exposure already
// applied, which commute with a blur anyway). Its passes run only while the
// amount is at least 0.5 (their draw counts are read from it); the depth view
// needs none of them.

import { INLINE_HELPERS, MAX_LEVELS, PASSES, inlineGlsl } from "./glsl";
import { DEFAULTS, DEPTH_KEY, RANGES, SHAPES, STAGE_ID, type UniformKey } from "./params";
import type { ProcessingStageContribution, UniformDeclaration } from "./safelight";

/** The host's name for a stage's prepass result sampler: `u_` and the first
 *  four base-36 digits of the stage id's hash (core's shader-compiler.ts). */
export function resultSampler(stageId: string): string {
  let h = 0;
  for (let i = 0; i < stageId.length; i++) h = ((h << 5) - h + stageId.charCodeAt(i)) | 0;
  return `u_${(h >>> 0).toString(36).slice(0, 4)}_stageResult`;
}

const UNIFORMS: Record<UniformKey, UniformDeclaration> = {
  amount: { key: "amount", glslType: "float", default: DEFAULTS.amount, range: RANGES.amount, label: "Blur amount" },
  near: { key: "near", glslType: "float", default: DEFAULTS.near, range: { min: 0, max: 1 }, label: "Focal range near" },
  far: { key: "far", glslType: "float", default: DEFAULTS.far, range: { min: 0, max: 1 }, label: "Focal range far" },
  shape: { key: "shape", glslType: "int", default: DEFAULTS.shape, range: { min: 0, max: SHAPES.length - 1, step: 1 }, label: "Bokeh" },
  boost: { key: "boost", glslType: "float", default: DEFAULTS.boost, range: RANGES.boost, label: "Boost" },
  view: { key: "view", glslType: "float", default: 0 },
};

const passUniforms = (...keys: UniformKey[]): UniformDeclaration[] => keys.map((k) => UNIFORMS[k]);

export function lensBlurStage(): ProcessingStageContribution {
  const [base, levels, gather, smooth] = PASSES;
  return {
    id: STAGE_ID,
    name: "Lens Blur",
    phase: "scene-linear",
    // Ahead of the scene-linear looks (Glow at 70): they see the blurred photo.
    priority: 30,
    reads: "current",
    space: { encoding: "linear", primaries: "rec709" },
    glsl: inlineGlsl(resultSampler(STAGE_ID)),
    helpers: INLINE_HELPERS,
    uniforms: Object.values(UNIFORMS),
    textures: [{ key: DEPTH_KEY, kind: "dynamic", perPhoto: true }],
    passes: [
      { channels: 4, glsl: base.glsl, helpers: base.helpers, iterations: { key: "amount", max: 1 }, uniforms: passUniforms("boost") },
      { channels: 4, glsl: levels.glsl, helpers: levels.helpers, iterations: { key: "amount", max: MAX_LEVELS - 1 }, keep: true },
      {
        channels: 4,
        glsl: gather.glsl,
        helpers: gather.helpers,
        iterations: { key: "amount", max: 1 },
        uniforms: passUniforms("amount", "near", "far", "shape", "boost"),
      },
      { channels: 4, glsl: smooth.glsl, helpers: smooth.helpers, iterations: { key: "amount", max: 1 } },
    ],
    dormantWhen: { amount: 0, view: 0 },
    presetScope: "per-image",
  };
}
