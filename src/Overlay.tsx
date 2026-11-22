// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The on-image tool: with Pick, a click focuses at the depth under it and a
// drag keeps the dragged area sharp; with Nearer or Further, strokes move the
// depth under the brush, shown as they are painted and kept as one undo step
// each. Ctrl, Cmd or Space held hands the pointer to the canvas's pan and zoom.

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { focusAt, focusOn, openStrokes, paintDone, paintLive } from "./actions";
import { readStrokes, roundDab, type DepthStroke } from "./depth/strokes";
import { React, api } from "./rt";
import type { OverlayRect2 } from "./safelight";
import { ui } from "./store";

const RING: CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  borderRadius: "50%",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.7)",
  pointerEvents: "none",
};

/** The pointer in `el`'s layout px (the Interface scale zooms the page). */
function localPoint(el: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const zoom = el.offsetWidth > 0 && r.width > 0 ? r.width / el.offsetWidth : 1;
  return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
}

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

type Gesture =
  | { kind: "focus"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "paint"; stroke: DepthStroke; before: DepthStroke[]; last: { x: number; y: number } };

export function LensOverlay(_props: { rect: OverlayRect2 }) {
  const { toImage, radiusToScreen, radiusToImage } = api.develop.useDevelopOverlay();
  const state = ui()();
  const root = React.useRef<HTMLDivElement | null>(null);
  const [gesture, setGesture] = React.useState<Gesture | null>(null);
  const [pointer, setPointer] = React.useState<{ x: number; y: number } | null>(null);
  const [passing, setPassing] = React.useState(false);
  const brush = state.tool === "nearer" || state.tool === "further";

  React.useEffect(() => api.develop.setCanvasCursor(brush ? "none" : "crosshair", { priority: 20 }), [brush]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!isEditable(e.target) && (e.code === "Space" || e.ctrlKey || e.metaKey)) setPassing(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || !(e.ctrlKey || e.metaKey)) setPassing(false);
    };
    const blur = () => setPassing(false);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const ringPx = radiusToScreen ? radiusToScreen(state.brushSize) : 0;

  const dabAt = (p: { x: number; y: number }): number[] | null => {
    if (!toImage) return null;
    const uv = toImage(p.x, p.y);
    return [roundDab(uv.x), roundDab(uv.y), roundDab(state.brushSize)];
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !root.current) return;
    const p = localPoint(root.current, e.clientX, e.clientY);
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
    const p = localPoint(root.current, e.clientX, e.clientY);
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
      style={{ position: "absolute", inset: 0, pointerEvents: passing ? "none" : "auto", touchAction: "none" }}
    >
      {box && box.width + box.height > 4 && (
        <div style={{ position: "absolute", ...box, border: "1px dashed rgba(255,255,255,0.85)", boxShadow: "0 0 0 1px rgba(0,0,0,0.4)", pointerEvents: "none" }} />
      )}
      {brush && pointer && radiusToImage && (
        <>
          <div style={{ ...RING, left: pointer.x, top: pointer.y, width: 2 * ringPx, height: 2 * ringPx }} />
          <div
            style={{
              ...RING,
              left: pointer.x,
              top: pointer.y,
              width: 2 * ringPx * (1 - state.brushFeather),
              height: 2 * ringPx * (1 - state.brushFeather),
              opacity: 0.6,
            }}
          />
        </>
      )}
    </div>
  );
}
