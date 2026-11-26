// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The on-image tool: with Pick, a click focuses at the depth under it and a
// drag keeps the dragged area sharp; with Nearer or Further, strokes move the
// depth under the official brush, shown as they are painted and kept as one
// undo step each. Ctrl, Cmd or Space held hands the pointer to the canvas's
// pan and zoom: core does that for a zoomable tool.

import type { PointerEvent as ReactPointerEvent } from "react";
import { focusAt, focusOn, openStrokes, paintDone, paintLive } from "./actions";
import { readStrokes, roundDab, type DepthStroke } from "./depth/strokes";
import { React, api } from "./rt";
import type { OverlayRect2 } from "./safelight";
import { ui } from "./store";

type Gesture =
  | { kind: "focus"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "paint"; stroke: DepthStroke; before: DepthStroke[]; last: { x: number; y: number } };

export function LensOverlay(_props: { rect: OverlayRect2 }) {
  const { toImage, radiusToScreen } = api.develop.useDevelopOverlay();
  const state = ui()();
  const root = React.useRef<HTMLDivElement | null>(null);
  const [gesture, setGesture] = React.useState<Gesture | null>(null);
  const [pointer, setPointer] = React.useState<{ x: number; y: number } | null>(null);
  const brush = state.tool === "nearer" || state.tool === "further";

  React.useEffect(() => api.develop.setCanvasCursor("crosshair", { priority: 20 }), []);

  const ringPx = radiusToScreen ? radiusToScreen(state.brushSize) : 0;

  const dabAt = (p: { x: number; y: number }): number[] | null => {
    if (!toImage) return null;
    const uv = toImage(p.x, p.y);
    return [roundDab(uv.x), roundDab(uv.y), roundDab(state.brushSize)];
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !root.current) return;
    const p = api.develop.framePoint(root.current, e.clientX, e.clientY);
    root.current.setPointerCapture(e.pointerId);
    if (!brush) {
      setGesture({ kind: "focus", from: p, to: p });
      return;
    }
    const dab = dabAt(p);
    if (!dab) return;
    const stroke: DepthStroke = { dir: state.tool === "nearer" ? 1 : -1, amount: state.brushAmount, feather: state.brushFeather, dabs: dab };
    const before = readStrokes(openStrokes());
    setGesture({ kind: "paint", stroke, before, last: p });
    paintLive([...before, stroke]);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!root.current) return;
    const p = api.develop.framePoint(root.current, e.clientX, e.clientY);
    setPointer(p);
    if (!gesture) return;
    if (gesture.kind === "focus") {
      setGesture({ ...gesture, to: p });
      return;
    }
    if (Math.hypot(p.x - gesture.last.x, p.y - gesture.last.y) < Math.max(2, ringPx * 0.25)) return;
    const dab = dabAt(p);
    if (!dab) return;
    const stroke = { ...gesture.stroke, dabs: [...gesture.stroke.dabs, ...dab] };
    setGesture({ ...gesture, stroke, last: p });
    paintLive([...gesture.before, stroke]);
  };

  const onUp = () => {
    const g = gesture;
    setGesture(null);
    if (!g || !toImage) return;
    if (g.kind === "paint") {
      void paintDone([...g.before, g.stroke], g.stroke.dir > 0 ? "Lens Blur: Nearer" : "Lens Blur: Further");
      return;
    }
    const a = toImage(g.from.x, g.from.y);
    if (Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y) < 4) {
      focusAt(a.x, a.y);
      return;
    }
    const b = toImage(g.to.x, g.to.y);
    focusOn(a.x, a.y, b.x, b.y);
  };

  const box =
    gesture?.kind === "focus"
      ? {
          left: Math.min(gesture.from.x, gesture.to.x),
          top: Math.min(gesture.from.y, gesture.to.y),
          width: Math.abs(gesture.to.x - gesture.from.x),
          height: Math.abs(gesture.to.y - gesture.from.y),
        }
      : null;

  return (
    <div
      ref={root}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => setPointer(null)}
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
    >
      {box && box.width + box.height > 4 && (
        <div style={{ position: "absolute", ...box, border: "1px dashed rgba(255,255,255,0.85)", boxShadow: "0 0 0 1px rgba(0,0,0,0.4)", pointerEvents: "none" }} />
      )}
      {brush && (
        <api.develop.BrushCursor at={state.brushPreview ? "centre" : pointer} size={state.brushSize} feather={state.brushFeather} />
      )}
    </div>
  );
}
