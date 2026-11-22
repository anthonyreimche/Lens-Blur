// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The panel's own state, not the photo's: what is running, the on-image tool
// held and the refine brush.

import type { StoreApi, UseBoundStore } from "zustand";
import { api } from "./rt";

/** "focus": click or drag on the photo to set the focal range. "nearer" and
 *  "further": the refine brushes. */
export type Tool = "none" | "focus" | "nearer" | "further";

export interface UiState {
  busy: "download" | "estimate" | null;
  error: string | null;
  /** Whether the depth model is downloaded; null until known. */
  hasModel: boolean | null;
  tool: Tool;
  /** Brush radius, as a share of the photo's height (core's brush dabs). */
  brushSize: number;
  brushFeather: number;
  brushAmount: number;
  showDepth: boolean;
  /** Bumped when a depth map arrives, for what draws from it. */
  revision: number;
}

export const INITIAL_UI: UiState = {
  busy: null,
  error: null,
  hasModel: null,
  tool: "none",
  brushSize: 0.05,
  brushFeather: 0.5,
  brushAmount: 0.5,
  showDepth: false,
  revision: 0,
};

let made: UseBoundStore<StoreApi<UiState>> | null = null;

/** The store, made on first use with the app's zustand. */
export function ui(): UseBoundStore<StoreApi<UiState>> {
  made ??= api.stores.create<UiState>()(() => ({ ...INITIAL_UI }));
  return made;
}

/** Forget the store (the extension stopped; the next start makes a fresh one). */
export function resetUi(): void {
  made = null;
}
