// Lens Blur, a Safelight extension (GPL-3.0-or-later).
//
// A shallow depth of field after the fact: each photo's depth is estimated
// (Depth Anything V2 Small, run in the window on WebAssembly, or a simple
// top-to-bottom depth), refined by hand, and handed to a GPU stage that
// blurs what lies outside the focal range as a lens would. Registers the
// stage (stage.ts), the depth provider (controller.ts) and the Develop panel.

import { attach, checkModel, detach, setShowDepth, setTool } from "./actions";
import { LensBlurController, type ControllerHost } from "./controller";
import { indexedDbStore } from "./depth/store";
import { LensOverlay } from "./Overlay";
import { LensBlurPanel } from "./Panel";
import { DEPTH_KEY, EXT_ID, PARAM, STAGE_ID } from "./params";
import { api, initRuntime } from "./rt";
import type { DevelopState, SafelightAPI } from "./safelight";
import { lensBlurStage } from "./stage";
import { resetUi, ui } from "./store";

export const PANEL_ID = `${EXT_ID}.panel`;

let running: LensBlurController | null = null;
let stopWatching: (() => void)[] = [];

/** A bitmap's pixels, as 8-bit RGBA rows from the top. */
function pixelsOf(bitmap: ImageBitmap): { data: Uint8ClampedArray; width: number; height: number } | null {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
}

export function hostFor(host: SafelightAPI): ControllerHost {
  const dev = () => host.stores.useDevelopStore.getState();
  return {
    photo: (id) => host.stores.useCatalogStore.getState().photos.find((p) => p.id === id),
    openPhotoId: () => dev().photoId,
    openBag: () => dev().paramBag,
    setBag: (patch) => dev().setDynParams(patch),
    commit: (label) => dev().commitEdit(label),
    sourcePixels: () => host.develop.sourcePixels(),
    renderPixels: async (id) => {
      const bitmap = await host.develop.renderPhotoFrame(id, host.develop.normalizeParams({}));
      return bitmap ? pixelsOf(bitmap) : null;
    },
    savedBag: async (id) => {
      const edit = await host.catalog.getEditState(id);
      return edit ? (edit.stack[edit.currentIndex]?.paramBag ?? {}) : null;
    },
    photoData: (key, id) => host.develop.getPhotoData(key, id),
    putOpenPhotoData: (key, data) => host.develop.putPhotoData(key, data),
    setTexture: (id, data) => host.setStageTexture(STAGE_ID, DEPTH_KEY, data, id),
    network: host.network,
  };
}

function reset(): void {
  const dev = api.stores.useDevelopStore.getState();
  dev.setDynParams(Object.fromEntries(Object.values(PARAM).map((k) => [k, undefined])));
  void dev.commitEdit("Lens Blur reset");
}

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  running?.dispose();
  running = new LensBlurController(hostFor(host), indexedDbStore());
  attach(running, LensOverlay);
  host.registerProcessingStage(lensBlurStage());
  host.setStageTextureProvider(STAGE_ID, DEPTH_KEY, running.provide);
  host.registerPanel({
    id: PANEL_ID,
    title: "Lens Blur",
    component: LensBlurPanel,
    defaultDock: { module: "develop", direction: "right", width: 280 },
    onReset: reset,
  });
  void checkModel().catch(() => undefined);
  for (const stop of stopWatching) stop();
  const c = running;
  const sync = () => void c.syncOpen();
  const edited = (s: DevelopState, prev: DevelopState) =>
    s.photoId !== prev.photoId || s.paramBag[PARAM.method] !== prev.paramBag[PARAM.method] || s.paramBag[PARAM.refine] !== prev.paramBag[PARAM.refine];
  stopWatching = [
    host.stores.useDevelopStore.subscribe((s, prev) => edited(s, prev) && sync()),
    host.develop.onSourcePixels(sync),
    // Core holds what it was given for a photo (or that it has none) until
    // let go of: a photo whose edit changed outside Develop (Paste Settings,
    // Sync) is asked for again, so a pasted blur without a depth is refused.
    host.events.onBroadcast((m) => {
      const id = m.type === "edit-update" ? m.payload.photoId : null;
      if (id && id !== host.stores.useDevelopStore.getState().photoId) host.dropStageTextureVariants(STAGE_ID, DEPTH_KEY, id);
    }),
    c.onError((error) => ui().setState({ error })),
    // A depth made (or let go of, for another photo) settles what was reported before it.
    c.onChange(() => ui().setState({ error: null })),
  ];
  sync();
}

/** The host sweeps the stage, its provider and the panel after every deactivate. */
export function deactivate(): void {
  for (const stop of stopWatching) stop();
  stopWatching = [];
  setTool("none");
  setShowDepth(false);
  running?.dispose();
  running = null;
  detach();
  resetUi();
}
