// The refine brushes are Safelight's official brush: they start from its
// defaults, take its rebindable shortcuts while held, show its ring, and leave
// pan and zoom to core.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { activate, deactivate, PANEL_ID } from "../src/index";
import { PARAM } from "../src/params";
import { ui } from "../src/store";
import { BRUSH_DEFAULTS, fakeApi, type Rig } from "./support/fake-api";

const WITH_DEPTH = { [PARAM.method]: "simple", [PARAM.amount]: 50, [PARAM.near]: 0.6, [PARAM.far]: 0.5 };

function start(): Rig {
  const rig = fakeApi(WITH_DEPTH);
  activate(rig.api);
  const panel = rig.panels.find((p) => p.id === PANEL_ID);
  if (!panel) throw new Error("no panel");
  render(React.createElement(panel.component));
  return rig;
}

function held(rig: Rig) {
  const tool = rig.tool();
  if (!tool) throw new Error("no tool held");
  return tool;
}

afterEach(() => {
  cleanup();
  deactivate();
});

describe("the refine brush", () => {
  it("starts at the official brush's size and feather", () => {
    start();
    expect(ui().getState().brushSize).toBe(BRUSH_DEFAULTS.size);
    expect(ui().getState().brushFeather).toBe(BRUSH_DEFAULTS.feather);
  });

  it("takes the brush shortcuts for the settings it has while Nearer or Further is held", () => {
    const rig = start();
    fireEvent.click(screen.getByText("Nearer"));
    const tool = held(rig);
    expect(tool.wants?.("brush.larger")).toBe(true);
    act(() => void tool.onAction?.("brush.larger"));
    expect(ui().getState().brushSize).toBeCloseTo(BRUSH_DEFAULTS.size + 0.01, 6);
    act(() => void tool.onAction?.("brush.featherUp"));
    expect(ui().getState().brushFeather).toBeCloseTo(BRUSH_DEFAULTS.feather + 0.05, 6);
    // Strength is how much a stroke lays down: the opacity keys step it.
    act(() => void tool.onAction?.("brush.opacityUp"));
    expect(ui().getState().brushAmount).toBeCloseTo(0.6, 6);
    // It has no flow, so the flow keys are left to core.
    expect(tool.wants?.("brush.flowUp")).toBe(false);
    expect(tool.onAction?.("brush.flowUp")).toBe(false);
  });

  it("leaves the brush shortcuts alone while picking the focus", () => {
    const rig = start();
    fireEvent.click(screen.getByText("Pick"));
    expect(held(rig).wants?.("brush.larger")).toBe(false);
    expect(held(rig).onAction?.("brush.larger")).toBe(false);
    expect(ui().getState().brushSize).toBe(BRUSH_DEFAULTS.size);
  });

  it("sizes its sliders as Masking's brush does", () => {
    const rig = start();
    fireEvent.click(screen.getByText("Nearer"));
    const size = rig.sliders(document.body).find((s) => s.label === "Size");
    const feather = rig.sliders(document.body).find((s) => s.label === "Feather");
    expect(size).toMatchObject({ min: 1, max: 50, step: 1, defaultValue: 8, value: 8 });
    expect(feather).toMatchObject({ min: 0, max: 100, step: 1, defaultValue: 50, value: 50 });
  });

  it("shows the official ring at the pointer, and at the centre while its size is dragged", () => {
    const rig = start();
    fireEvent.click(screen.getByText("Further"));
    const Overlay = held(rig).overlay;
    const { container } = render(<Overlay rect={{ x: 0, y: 0, w: 400, h: 300 }} />);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.pointerMove(root, { clientX: 120, clientY: 80 });
    expect(rig.brushCursor()).toEqual({ at: { x: 120, y: 80 }, size: BRUSH_DEFAULTS.size, feather: BRUSH_DEFAULTS.feather });
    const size = rig.sliders(document.body).find((s) => s.label === "Size");
    act(() => size?.onChange(12));
    expect(rig.brushCursor()).toEqual({ at: "centre", size: 0.12, feather: BRUSH_DEFAULTS.feather });
    act(() => size?.onCommit?.());
    expect(rig.brushCursor()?.at).toEqual({ x: 120, y: 80 });
  });

  it("leaves Ctrl, Cmd and Space to core's pan and zoom", () => {
    const rig = start();
    fireEvent.click(screen.getByText("Nearer"));
    const Overlay = held(rig).overlay;
    const { container } = render(<Overlay rect={{ x: 0, y: 0, w: 400, h: 300 }} />);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(window, { code: "Space" });
    expect(root.style.pointerEvents).not.toBe("none");
    expect(held(rig).zoomable).toBe(true);
  });
});
