// A stand-in Safelight API for unit tests, over real React and zustand. It has
// only what this extension uses: reading any other member throws, naming it,
// so a test shows what to add here when the extension starts using more.
//
// The open photo's edit is a param bag in a zustand develop store; the scope a
// panel edits reads and writes it, falling back to the registered uniforms'
// defaults as Safelight's does. The UI kit's controls are plain elements that
// keep the props that matter to a test (title, active, disabled).

import * as React from "react";
import { create } from "zustand";
import type {
  BroadcastMessage,
  CanvasTool,
  PanelContribution,
  ParamScope,
  ProcessingStageContribution,
  SafelightAPI,
  SliderProps,
  StageTextureData,
} from "../../src/safelight";

type Provide = (variant: string, signal: AbortSignal) => Promise<StageTextureData | null>;

export const PHOTO_ID = "0b9c4e1e-1111-4222-8333-944455556666";

export interface Rig {
  api: SafelightAPI;
  panels: PanelContribution[];
  stages: ProcessingStageContribution[];
  providers: Map<string, Provide>;
  /** The photo's param bag, by qualified key, without defaults. */
  params(): Readonly<Record<string, unknown>>;
  setParams(patch: Record<string, unknown>): void;
  commits: string[];
  /** Stage texture variants set, by "{stageId}.{key}#{variant}". */
  textures: Map<string, StageTextureData>;
  /** Provided variants let go of, as "{stageId}.{key}#{variant}". */
  dropped: string[];
  /** Sends a message as another part of the app broadcasts it. */
  broadcast(message: BroadcastMessage): void;
  /** The canvas tool held now, if any. */
  tool(): CanvasTool | null;
  viewValues(): Record<string, unknown> | null;
  sliders(root: ParentNode): SliderProps[];
}

type Props = Record<string, unknown> & { children?: React.ReactNode };

export function fakeApi(initial: Record<string, unknown> = {}): Rig {
  const panels: PanelContribution[] = [];
  const stages: ProcessingStageContribution[] = [];
  const providers = new Map<string, Provide>();
  const commits: string[] = [];
  const textures = new Map<string, StageTextureData>();
  const dropped: string[] = [];
  const listeners = new Set<(m: BroadcastMessage) => void>();
  const defaults = new Map<string, unknown>();
  const develop = create<{
    photoId: string | null;
    paramBag: Record<string, unknown>;
    setDynParams(patch: Record<string, unknown>): void;
    commitEdit(label: string): Promise<void>;
  }>()((set) => ({
    photoId: PHOTO_ID,
    paramBag: { ...initial },
    setDynParams: (patch) =>
      set((s) => {
        const next = { ...s.paramBag, ...patch };
        for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
        return { paramBag: next };
      }),
    commitEdit: async (label) => void commits.push(label),
  }));
  const catalog = create(() => ({ photos: [{ id: PHOTO_ID, relPath: "a/IMG_1.CR2", fileSize: 1000, rotation: 0 }] }));
  const canvas = create<{ held: CanvasTool | null; view: Record<string, unknown> | null }>()(() => ({ held: null, view: null }));
  const sliderProps = new Map<number, SliderProps>();
  let nextSlider = 0;

  function useParamScope(): ParamScope {
    const params = develop((s) => s.paramBag);
    return {
      maskId: null,
      getParam: (key) => (key in params ? params[key] : defaults.get(key)),
      getParams: () => params,
      setParams: (patch) => develop.getState().setDynParams(patch),
      commit: (label) => void commits.push(label),
    };
  }

  function Slider(props: SliderProps) {
    const id = React.useRef(nextSlider++).current;
    sliderProps.set(id, props);
    return React.createElement("div", { "data-slider": id }, `${props.label} ${props.value}`);
  }

  const passThrough = (tag: string) =>
    function Element({ children, active, variant: _variant, size: _size, full: _full, ...rest }: Props) {
      return React.createElement(tag, { ...rest, "data-active": active ? "true" : undefined }, children);
    };

  const members = {
    version: 1,
    extensionId: "lens-blur",
    react: React,
    registerPanel: (c: PanelContribution) => void panels.push(c),
    registerProcessingStage: (c: ProcessingStageContribution) => {
      stages.push(c);
      for (const u of c.uniforms) defaults.set(`${c.id}.${u.key}`, u.default);
    },
    setStageTextureProvider: (stageId: string, key: string, provide: Provide | null) => {
      if (provide) providers.set(`${stageId}.${key}`, provide);
      else providers.delete(`${stageId}.${key}`);
    },
    setStageTexture: (stageId: string, key: string, tex: StageTextureData | null, variant?: string) => {
      const at = `${stageId}.${key}#${variant ?? ""}`;
      if (tex) textures.set(at, tex);
      else textures.delete(at);
    },
    dropStageTextureVariants: (stageId: string, key: string, variant?: string) => void dropped.push(`${stageId}.${key}#${variant ?? ""}`),
    events: {
      onBroadcast: (handler: (m: BroadcastMessage) => void) => {
        listeners.add(handler);
        return () => listeners.delete(handler);
      },
    },
    network: { fetch: async () => new Response(new Uint8Array([0])) },
    components: { Slider },
    ui: {
      Button: passThrough("button"),
      Field: ({ label, children }: Props) => React.createElement("label", null, label as React.ReactNode, children),
      ProgressBar: () => React.createElement("progress"),
      Row: ({ children }: Props) => React.createElement("div", null, children),
      Stack: ({ children }: Props) => React.createElement("div", null, children),
      Section: ({ title, right, children }: Props) =>
        React.createElement("section", null, React.createElement("h3", null, title as React.ReactNode), right as React.ReactNode, children),
      Select: ({ value, onChange, options, ariaLabel, title, disabled }: Props & { onChange: (v: string) => void; options: { value: string; label: string }[] }) =>
        React.createElement(
          "select",
          { value, "aria-label": ariaLabel, title, disabled, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) },
          options.map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label)),
        ),
      Toggle: ({ checked, onChange, label }: Props & { checked: boolean; onChange: (v: boolean) => void }) =>
        React.createElement("label", null, label as React.ReactNode, React.createElement("input", { type: "checkbox", checked, onChange: () => onChange(!checked) })),
      tokens: {
        surface1: "var(--color-surface-1)",
        borderSubtle: "var(--color-border-subtle)",
        textSecondary: "var(--color-text-secondary)",
        textMuted: "var(--color-text-muted)",
        accent: "var(--color-accent)",
      },
    },
    develop: {
      useParamScope,
      useCanvasToolHeld: () => canvas((s) => s.held !== null),
      setCanvasTool: (t: CanvasTool | null) => canvas.setState({ held: t }),
      setViewValues: (v: Record<string, unknown> | null) => canvas.setState({ view: v }),
      sourcePixels: () => ({ data: new Uint8ClampedArray(64 * 48 * 4).fill(100), width: 64, height: 48 }),
      renderPhotoFrame: async () => null,
      setCanvasCursor: () => () => undefined,
      onSourcePixels: () => () => undefined,
      getPhotoData: async () => null,
      putPhotoData: () => undefined,
    },
    stores: { useDevelopStore: develop, useCatalogStore: catalog, create },
    catalog: { getEditState: async () => null },
  };

  return {
    // The fake carries only what the extension reads; the strict proxy names
    // anything else it reaches for.
    api: strict(members, "api") as unknown as SafelightAPI,
    panels,
    stages,
    providers,
    params: () => develop.getState().paramBag,
    setParams: (patch) => develop.getState().setDynParams(patch),
    commits,
    textures,
    dropped,
    broadcast: (m) => {
      for (const l of [...listeners]) l(m);
    },
    tool: () => canvas.getState().held,
    viewValues: () => canvas.getState().view,
    sliders: (root) =>
      [...root.querySelectorAll("[data-slider]")].map((e) => {
        const props = sliderProps.get(Number(e.getAttribute("data-slider")));
        if (!props) throw new Error("a slider without props");
        return props;
      }),
  };
}

/** Wraps a plain object so reading a member it lacks throws, naming the member. */
function strict<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return Reflect.get(obj, key, receiver);
      if (!(key in obj)) throw new Error(`The fake API has no ${path}.${key}. Add it to test/support/fake-api.ts.`);
      const value: unknown = Reflect.get(obj, key, receiver);
      const isPlainObject = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
      return isPlainObject && key !== "react" && key !== "tokens" ? strict(value, `${path}.${key}`) : value;
    },
  });
}
