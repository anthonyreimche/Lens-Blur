// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// What the panel and the on-image tool do, over the controller and the app.

import type { LensBlurController } from "./controller";
import type { DepthMethod } from "./depth/estimator";
import type { DepthStroke } from "./depth/strokes";
import { BAND_WIDTH, bandAround, bandFromSamples, samplesIn, type Band } from "./model";
import { PARAM, readParams } from "./params";
import { api } from "./rt";
import type { CanvasTool } from "./safelight";
import { ui, type Tool } from "./store";

let current: LensBlurController | null = null;
let overlay: CanvasTool["overlay"] | null = null;

export function attach(controller: LensBlurController, toolOverlay: CanvasTool["overlay"]): void {
  current = controller;
  overlay = toolOverlay;
}

export function detach(): void {
  current = null;
  overlay = null;
}

export function controller(): LensBlurController {
  if (!current) throw new Error("Lens Blur isn't running.");
  return current;
}

/** The controller, or null once the extension has stopped (a panel can draw
 *  once more before the host takes it away). */
export function runningController(): LensBlurController | null {
  return current;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Learns whether the model is downloaded (without reading it), for the panel's first draw. */
export async function checkModel(): Promise<void> {
  const has = await controller().hasModel();
  ui().setState({ hasModel: has });
}

/** Estimates the open photo's depth by `method`, downloading the model first
 *  when it isn't kept yet (the person's click is their consent). */
export async function estimate(method: DepthMethod): Promise<void> {
  const state = ui();
  if (state.getState().busy) return;
  state.setState({ error: null });
  try {
    if (method === "model" && !(await controller().hasModel())) {
      state.setState({ busy: "download" });
      await controller().downloadModel();
      state.setState({ hasModel: true });
    }
    state.setState({ busy: "estimate" });
    await controller().estimateOpen(method);
  } catch (e) {
    state.setState({ error: message(e) });
  } finally {
    state.setState({ busy: null });
  }
}

// The refine brush's settings by the official brush's names: Strength is how
// much a stroke lays down, its opacity. It has no flow.
const BRUSH_KEYS = { size: "brushSize", feather: "brushFeather", opacity: "brushAmount" } as const;

/** Whether the held tool takes the brush shortcut `action`; with `run`, take it. */
function brushAction(action: string, run: boolean): boolean {
  const s = ui().getState();
  if (s.tool !== "nearer" && s.tool !== "further") return false;
  const step = api.develop.brush.step(action, { size: s.brushSize, feather: s.brushFeather, opacity: s.brushAmount });
  const key = step && step.key !== "flow" ? BRUSH_KEYS[step.key] : null;
  if (!step || !key) return false;
  if (run) ui().setState({ [key]: step.value });
  return true;
}

/** Holds the canvas with `tool`, or lets it go. */
export function setTool(tool: Tool): void {
  ui().setState({ tool });
  if (tool === "none" || !overlay) {
    api.develop.setCanvasTool(null);
    return;
  }
  api.develop.setCanvasTool({
    overlay,
    zoomable: true,
    onEscape: () => ui().setState({ tool: "none" }),
    onAction: (action) => brushAction(action, true),
    wants: (action) => brushAction(action, false),
  });
}

export function setShowDepth(on: boolean): void {
  ui().setState({ showDepth: on });
  api.develop.setViewValues(on ? { [PARAM.view]: 1 } : null);
}

function setBand(band: Band, label: string): void {
  const dev = api.stores.useDevelopStore.getState();
  dev.setDynParams({ [PARAM.near]: band.near, [PARAM.far]: band.far });
  void dev.commitEdit(label);
}

/** Focuses on the depth at (u, v), 0 to 1 across the photo, keeping the focal
 *  range's width. */
export function focusAt(u: number, v: number): void {
  const map = controller().openMap();
  if (!map) return;
  const r = 0.006;
  const samples = samplesIn(map, u - r, v - r * (map.width / map.height), u + r, v + r * (map.width / map.height)).sort((a, b) => a - b);
  const d = samples[Math.floor(samples.length / 2)];
  if (d === undefined) return;
  const p = readParams(api.stores.useDevelopStore.getState().paramBag);
  setBand(bandAround(d, Math.max(BAND_WIDTH, p.near - p.far)), "Lens Blur focus");
}

/** Focuses on the depths inside the box (0 to 1 across the photo). */
export function focusOn(u0: number, v0: number, u1: number, v1: number): void {
  const map = controller().openMap();
  if (!map) return;
  setBand(bandFromSamples(samplesIn(map, u0, v0, u1, v1)), "Lens Blur focus");
}

/** Shows `strokes` while a stroke is painted: the open photo's depth is
 *  made again from them (the controller runs one remake at a time). */
export function paintLive(strokes: DepthStroke[]): void {
  void controller()
    .refine(strokes)
    .catch((e) => ui().setState({ error: message(e) }));
}

/** Ends a stroke: its strokes become one undo step. */
export async function paintDone(strokes: DepthStroke[], label: string): Promise<void> {
  try {
    await controller().refine(strokes, label);
  } catch (e) {
    ui().setState({ error: message(e) });
  }
}

/** The open photo's strokes. */
export function openStrokes(): unknown {
  return api.stores.useDevelopStore.getState().paramBag[PARAM.refine];
}
