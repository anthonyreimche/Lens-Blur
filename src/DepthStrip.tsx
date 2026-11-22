// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// The focal range over the photo's depths: how much of the photo lies at each
// depth, nearest on the left, with the range drawn over it. Drag either edge,
// or the range itself, to move it; a click outside it moves it there.

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { BAND_WIDTH, bandAround, type Band } from "./model";
import { React, api } from "./rt";

const BINS = 64;
const HEIGHT = 40;
const GRAB = 0.03;

type Drag = { kind: "near" | "far" | "move"; from: number; start: Band };

/** The pointer across `el`, 0 to 1, in layout px (the Interface scale zooms the page). */
function across(el: HTMLElement, clientX: number): number {
  const r = el.getBoundingClientRect();
  const zoom = el.offsetWidth > 0 && r.width > 0 ? r.width / el.offsetWidth : 1;
  return Math.min(1, Math.max(0, (clientX - r.left) / zoom / Math.max(1, el.offsetWidth)));
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** The range after a drag of `drag` to `x` (0 near, 1 far, as drawn). */
export function dragBand(drag: Drag, x: number): Band {
  const d = 1 - x;
  const { near, far } = drag.start;
  if (drag.kind === "near") return { near: round4(Math.min(1, Math.max(d, far + 0.005))), far };
  if (drag.kind === "far") return { near, far: round4(Math.max(0, Math.min(d, near - 0.005))) };
  const shift = drag.from - x;
  const width = near - far;
  const centre = Math.min(1 - width / 2, Math.max(width / 2, (near + far) / 2 + shift));
  return { near: round4(centre + width / 2), far: round4(centre - width / 2) };
}

export function DepthStrip(props: { histogram: number[] | null; band: Band; onChange: (b: Band) => void; onCommit: () => void }) {
  const { tokens } = api.ui;
  const root = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<Drag | null>(null);
  const { histogram, band, onChange, onCommit } = props;
  const left = 1 - band.near;
  const right = 1 - band.far;
  const peak = Math.max(1e-6, ...(histogram ?? [0]));

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!root.current || e.button !== 0) return;
    const x = across(root.current, e.clientX);
    let kind: Drag["kind"] = "move";
    if (Math.abs(x - left) < GRAB) kind = "near";
    else if (Math.abs(x - right) < GRAB) kind = "far";
    else if (x < left || x > right) {
      const moved = bandAround(1 - x, Math.max(BAND_WIDTH, band.near - band.far));
      onChange(moved);
      drag.current = { kind: "move", from: x, start: moved };
      root.current.setPointerCapture(e.pointerId);
      return;
    }
    drag.current = { kind, from: x, start: band };
    root.current.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !root.current) return;
    onChange(dragBand(drag.current, across(root.current, e.clientX)));
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    onCommit();
  };
  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowLeft" ? -0.01 : e.key === "ArrowRight" ? 0.01 : 0;
    if (step === 0) return;
    e.preventDefault();
    onChange(dragBand({ kind: "move", from: 0, start: band }, step * (e.shiftKey ? 5 : 1)));
    onCommit();
  };

  return (
    <div
      ref={root}
      role="slider"
      aria-label="Focal range"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(100 * left)}
      tabIndex={0}
      title="The photo's depths, nearest on the left. The lit range stays sharp: drag its edges to widen or narrow it, drag it to move it, or click elsewhere to focus there. The arrow keys move it too."
      onKeyDown={key}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{
        position: "relative",
        height: HEIGHT,
        background: tokens.surface1,
        border: `1px solid ${tokens.borderSubtle}`,
        borderRadius: 4,
        overflow: "hidden",
        cursor: "ew-resize",
        touchAction: "none",
      }}
    >
      {histogram?.map((v, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            bottom: 0,
            left: `${(100 * i) / BINS}%`,
            width: `${100 / BINS}%`,
            height: `${(100 * v) / peak}%`,
            background: tokens.textMuted,
            opacity: 0.55,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${100 * left}%`,
          width: `${Math.max(0.5, 100 * (right - left))}%`,
          background: tokens.accent,
          opacity: 0.35,
          borderLeft: `2px solid ${tokens.accent}`,
          borderRight: `2px solid ${tokens.accent}`,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

export const HISTOGRAM_BINS = BINS;
