// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The Develop panel: the depth estimate, then the blur set up as a lens is:
// how much, the bokeh's shape and brightness, the focal range, and the depth
// refined by hand where the estimate is wrong.

import type { ReactNode } from "react";
import { estimate, runningController, setShowDepth, setTool } from "./actions";
import type { LensBlurController } from "./controller";
import { DepthStrip, HISTOGRAM_BINS } from "./DepthStrip";
import { DEFAULTS, PARAM, RANGES, SHAPES, methodOf, readParams, type Shape } from "./params";
import { React, api } from "./rt";
import { ui, type Tool } from "./store";
import { readStrokes } from "./depth/strokes";

const TITLE = "Lens Blur";

const SHAPE_LABELS: Record<Shape, { label: string; title: string }> = {
  circle: { label: "Circle", title: "Round, evenly lit discs, as from a wide-open lens" },
  bubble: { label: "Bubble", title: "Discs with a bright rim, as from an old or over-corrected lens" },
  blade5: { label: "5 blades", title: "Pentagons, as from a lens stopped down with five aperture blades" },
  ring: { label: "Ring", title: "Hollow rings, as from a mirror lens" },
  cateye: { label: "Cat eye", title: "Discs that narrow toward the frame's edges, as a fast lens's do" },
};
const SHAPE_OPTIONS = SHAPES.map((s, i) => ({ value: String(i), label: SHAPE_LABELS[s].label }));

const TIPS = {
  estimate:
    "Estimate how far away each part of the photo is. The first time, this downloads the depth model (Depth Anything V2 Small, about 27 MB) and keeps it.",
  simple: "Use a depth that runs from far at the top of the photo to near at the bottom, without the model. Refine it by painting.",
  amount: "How strongly what lies outside the focal range is blurred.",
  shape: "The shape out-of-focus highlights take.",
  boost: "Brightens the brightest highlights before they blur, so they bloom into bright discs.",
  focus: "Click the photo to focus at that depth, or drag over an area to keep all of it sharp.",
  nearer: "Paint over areas the depth estimate placed too far away.",
  further: "Paint over areas the depth estimate placed too near.",
  clear: "Remove all painted depth corrections.",
  showDepth: "Show the depth over the photo: warm is near, blue is far, the focal range is lit.",
  size: "The brush's size.",
  feather: "How softly the brush's edge fades.",
  strength: "How far one stroke moves the depth.",
  method: "How the depth was made: by the depth model, or the simple top-to-bottom depth.",
};

function Tip(props: { title: string; children: ReactNode }) {
  return <div title={props.title}>{props.children}</div>;
}

const endPreview = () => ui().setState({ brushPreview: false });

function useRevision(controller: LensBlurController | null): number {
  const [revision, setRevision] = React.useState(0);
  React.useEffect(() => controller?.onChange(() => setRevision((r) => r + 1)), [controller]);
  return revision;
}

export function LensBlurPanel() {
  const { Slider } = api.components;
  const { Button, Field, ProgressBar, Row, Section, Select, Stack, Toggle, tokens } = api.ui;
  const brushDefaults = api.develop.brush.defaults;
  const scope = api.develop.useParamScope();
  const bag = scope.getParams();
  const params = readParams(bag);
  const method = methodOf(bag);
  const state = ui()();
  const held = api.develop.useCanvasToolHeld();
  const tool: Tool = held ? state.tool : "none";
  const controller = runningController();
  const revision = useRevision(controller);
  const histogram = React.useMemo(
    () => (method ? (controller?.histogram(HISTOGRAM_BINS) ?? null) : null),
    [controller, method, bag[PARAM.refine], revision],
  );
  if (!controller) return null;
  const strokes = readStrokes(bag[PARAM.refine]);

  const set = (key: keyof typeof PARAM, value: number) => scope.setParams({ [PARAM[key]]: value });
  const toggleTool = (t: Tool) => setTool(tool === t ? "none" : t);
  const busyLabel = state.busy === "download" ? "Downloading the depth model" : state.busy === "estimate" ? "Estimating depth" : null;

  const status = (
    <>
      {busyLabel && (
        <Stack gap={4}>
          <span style={{ color: tokens.textSecondary, fontSize: 11 }}>{busyLabel}</span>
          <ProgressBar indeterminate />
        </Stack>
      )}
      {state.error && (
        <Row gap={6} align="flex-start">
          <span style={{ color: tokens.textSecondary, fontSize: 11, flex: 1 }}>{state.error}</span>
          <Button variant="ghost" size="sm" aria-label="Dismiss" onClick={() => ui().setState({ error: null })}>
            ✕
          </Button>
        </Row>
      )}
    </>
  );

  if (!method) {
    return (
      <Stack gap={8} style={{ padding: 8 }}>
        <Row gap={6}>
          <Button variant="primary" size="sm" title={TIPS.estimate} disabled={!!state.busy} onClick={() => void estimate("model")}>
            Estimate depth
          </Button>
          <Button variant="secondary" size="sm" title={TIPS.simple} disabled={!!state.busy} onClick={() => void estimate("simple")}>
            Simple depth
          </Button>
        </Row>
        {status}
      </Stack>
    );
  }

  return (
    <Stack gap={8} style={{ padding: 8 }}>
      <Tip title={TIPS.amount}>
        <Slider
          label="Blur amount"
          value={params.amount}
          min={RANGES.amount.min}
          max={RANGES.amount.max}
          step={RANGES.amount.step}
          defaultValue={DEFAULTS.amount}
          onChange={(v) => set("amount", v)}
          onCommit={() => scope.commit(`${TITLE}: Blur amount`)}
        />
      </Tip>
      <Field label="Bokeh">
        <Select
          ariaLabel="Bokeh"
          title={`${TIPS.shape} ${SHAPE_LABELS[SHAPES[params.shape]].title}.`}
          value={String(params.shape)}
          options={SHAPE_OPTIONS}
          onChange={(v) => {
            set("shape", Number(v));
            scope.commit(`${TITLE}: Bokeh`);
          }}
        />
      </Field>
      <Tip title={TIPS.boost}>
        <Slider
          label="Boost"
          value={params.boost}
          min={RANGES.boost.min}
          max={RANGES.boost.max}
          step={RANGES.boost.step}
          defaultValue={DEFAULTS.boost}
          onChange={(v) => set("boost", v)}
          onCommit={() => scope.commit(`${TITLE}: Boost`)}
        />
      </Tip>
      <Section
        title="Focal range"
        right={
          <Button variant="ghost" size="sm" active={tool === "focus"} title={TIPS.focus} onClick={() => toggleTool("focus")}>
            Pick
          </Button>
        }
      >
        <DepthStrip
          histogram={histogram}
          band={{ near: params.near, far: params.far }}
          onChange={(b) => scope.setParams({ [PARAM.near]: b.near, [PARAM.far]: b.far })}
          onCommit={() => scope.commit(`${TITLE}: Focal range`)}
        />
      </Section>
      <Section
        title="Refine depth"
        right={
          strokes.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              title={TIPS.clear}
              onClick={() => void controller.refine([], `${TITLE}: Clear refinements`)}
            >
              Clear
            </Button>
          ) : null
        }
      >
        <Stack gap={6}>
          <Row gap={6}>
            <Button variant="secondary" size="sm" active={tool === "nearer"} title={TIPS.nearer} onClick={() => toggleTool("nearer")}>
              Nearer
            </Button>
            <Button variant="secondary" size="sm" active={tool === "further"} title={TIPS.further} onClick={() => toggleTool("further")}>
              Further
            </Button>
          </Row>
          {(tool === "nearer" || tool === "further") && (
            <>
              <Tip title={TIPS.size}>
                <Slider
                  label="Size"
                  value={Math.round(state.brushSize * 100)}
                  min={1}
                  max={50}
                  step={1}
                  defaultValue={Math.round(brushDefaults.size * 100)}
                  onChange={(v) => ui().setState({ brushSize: v / 100, brushPreview: true })}
                  onCommit={endPreview}
                />
              </Tip>
              <Tip title={TIPS.feather}>
                <Slider
                  label="Feather"
                  value={Math.round(state.brushFeather * 100)}
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={Math.round(brushDefaults.feather * 100)}
                  onChange={(v) => ui().setState({ brushFeather: v / 100, brushPreview: true })}
                  onCommit={endPreview}
                />
              </Tip>
              <Tip title={TIPS.strength}>
                <Slider
                  label="Strength"
                  value={Math.round(state.brushAmount * 100)}
                  min={1}
                  max={100}
                  step={1}
                  defaultValue={50}
                  onChange={(v) => ui().setState({ brushAmount: v / 100 })}
                />
              </Tip>
            </>
          )}
        </Stack>
      </Section>
      <Row gap={8} justify="space-between">
        <div title={TIPS.showDepth}>
          <Toggle label="Show depth" checked={state.showDepth} onChange={setShowDepth} />
        </div>
        <div title={TIPS.method} style={{ minWidth: 110 }}>
          <Select
            ariaLabel="Depth"
            value={method}
            disabled={!!state.busy}
            options={[
              { value: "model", label: "Estimated" },
              { value: "simple", label: "Simple" },
            ]}
            onChange={(v) => void estimate(v === "simple" ? "simple" : "model")}
          />
        </div>
      </Row>
      {status}
    </Stack>
  );
}
