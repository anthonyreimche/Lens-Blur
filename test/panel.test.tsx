import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activate, deactivate, PANEL_ID } from "../src/index";
import { PARAM, SHAPES, STAGE_ID } from "../src/params";
import { ui } from "../src/store";
import { fakeApi, PHOTO_ID, type Rig } from "./support/fake-api";

function start(initial: Record<string, unknown> = {}): Rig {
  const rig = fakeApi(initial);
  activate(rig.api);
  return rig;
}

function show(rig: Rig) {
  const panel = rig.panels.find((p) => p.id === PANEL_ID);
  if (!panel) throw new Error("no panel");
  return render(React.createElement(panel.component));
}

const WITH_DEPTH = { [PARAM.method]: "simple", [PARAM.amount]: 50, [PARAM.near]: 0.6, [PARAM.far]: 0.5 };

afterEach(() => {
  cleanup();
  deactivate();
});

describe("activation", () => {
  it("registers the stage, the depth provider and the panel", () => {
    const rig = start();
    expect(rig.stages.map((s) => s.id)).toEqual([STAGE_ID]);
    expect(rig.providers.has(`${STAGE_ID}.depth`)).toBe(true);
    expect(rig.panels.map((p) => p.title)).toEqual(["Lens Blur"]);
  });

  it("lets go of the canvas and the depth view when it stops", async () => {
    const rig = start(WITH_DEPTH);
    show(rig);
    fireEvent.click(screen.getByText("Pick"));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(rig.tool()).not.toBeNull();
    expect(rig.viewValues()).toEqual({ [PARAM.view]: 1 });
    act(() => deactivate());
    expect(rig.tool()).toBeNull();
    expect(rig.viewValues()).toBeNull();
  });
});

describe("other photos' edits", () => {
  it("lets go of what core holds for a photo whose edit changed elsewhere (a paste), so it is asked for again", () => {
    const rig = start();
    act(() => rig.broadcast({ type: "edit-update", payload: { photoId: "7d1f0000-1111-4222-8333-944455556666" } }));
    expect(rig.dropped).toEqual([`${STAGE_ID}.depth#7d1f0000-1111-4222-8333-944455556666`]);
  });

  it("leaves the open photo's own depth, which it sets itself", () => {
    const rig = start();
    act(() => rig.broadcast({ type: "edit-update", payload: { photoId: PHOTO_ID } }));
    act(() => rig.broadcast({ type: "edit-update", payload: { photoId: null } }));
    expect(rig.dropped).toEqual([]);
  });
});

describe("before the photo has a depth", () => {
  it("offers the estimate and the simple depth, each explained on hover", () => {
    show(start());
    expect(screen.getByText("Estimate depth").getAttribute("title")).toMatch(/downloads the depth model.*27 MB/);
    expect(screen.getByText("Simple depth").getAttribute("title")).toMatch(/far at the top/);
  });

  it("makes the simple depth and starts a blur focused on the middle, as one step", async () => {
    const rig = start();
    show(rig);
    fireEvent.click(screen.getByText("Simple depth"));
    await waitFor(() => expect(rig.commits).toEqual(["Lens Blur depth"]));
    expect(rig.params()[PARAM.method]).toBe("simple");
    expect(rig.params()[PARAM.amount]).toBe(50);
    await waitFor(() => expect([...rig.textures.keys()]).toEqual([`${STAGE_ID}.depth#${PHOTO_ID}`]));
    await screen.findByText("Blur amount 50");
  });

  it("clears an earlier notice once the photo's depth is made", async () => {
    const rig = start();
    show(rig);
    act(() => ui().setState({ error: "Lens Blur has no depth for this photo yet: open it in Develop to estimate it." }));
    expect(screen.getByText(/no depth for this photo yet/)).toBeTruthy();
    act(() => rig.setParams({ [PARAM.method]: "simple" }));
    await waitFor(() => expect(screen.queryByText(/no depth for this photo yet/)).toBeNull());
  });
});

describe("with a depth", () => {
  it("shows the blur's controls, each with a tooltip", () => {
    const rig = start(WITH_DEPTH);
    const { container } = show(rig);
    expect(rig.sliders(container).map((s) => s.label)).toEqual(["Blur amount", "Boost"]);
    for (const el of container.querySelectorAll("[data-slider]")) expect(el.parentElement?.getAttribute("title")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Focal range" }).getAttribute("title")).toMatch(/nearest on the left/);
  });

  it("writes a drag live and makes its release one step", () => {
    const rig = start(WITH_DEPTH);
    const { container } = show(rig);
    const [amount] = rig.sliders(container);
    act(() => amount.onChange(80));
    expect(rig.params()[PARAM.amount]).toBe(80);
    act(() => amount.onCommit?.());
    expect(rig.commits).toEqual(["Lens Blur: Blur amount"]);
  });

  it("offers the five bokeh shapes", () => {
    const rig = start(WITH_DEPTH);
    show(rig);
    const select = screen.getByLabelText("Bokeh") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Circle", "Bubble", "5 blades", "Ring", "Cat eye"]);
    fireEvent.change(select, { target: { value: String(SHAPES.indexOf("ring")) } });
    expect(rig.params()[PARAM.shape]).toBe(SHAPES.indexOf("ring"));
    expect(rig.commits).toEqual(["Lens Blur: Bokeh"]);
  });

  it("holds the canvas for picking the focus, and lets it go on a second click", () => {
    const rig = start(WITH_DEPTH);
    show(rig);
    fireEvent.click(screen.getByText("Pick"));
    expect(rig.tool()?.zoomable).toBe(true);
    expect(screen.getByText("Pick").getAttribute("data-active")).toBe("true");
    fireEvent.click(screen.getByText("Pick"));
    expect(rig.tool()).toBeNull();
  });

  it("shows the brush's settings while a refine brush is held", () => {
    const rig = start(WITH_DEPTH);
    const { container } = show(rig);
    fireEvent.click(screen.getByText("Nearer"));
    expect(rig.sliders(container).map((s) => s.label)).toEqual(["Blur amount", "Boost", "Size", "Feather", "Strength"]);
    expect(screen.queryByText("Clear")).toBeNull();
  });

  it("offers to clear the refinements once there are some", () => {
    const rig = start({ ...WITH_DEPTH, [PARAM.refine]: [{ dir: 1, amount: 1, feather: 0, dabs: [0.5, 0.5, 0.1] }] });
    show(rig);
    expect(screen.getByText("Clear").getAttribute("title")).toMatch(/Remove all painted/);
  });

  it("shows the depth over the photo as a view value, never in the edit", () => {
    const rig = start(WITH_DEPTH);
    show(rig);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(rig.viewValues()).toEqual({ [PARAM.view]: 1 });
    expect(PARAM.view in rig.params()).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(rig.viewValues()).toBeNull();
  });

  it("moves the focal range farther with the right arrow, as one step", () => {
    const rig = start(WITH_DEPTH);
    show(rig);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Focal range" }), { key: "ArrowRight" });
    expect(rig.params()[PARAM.near]).toBeCloseTo(0.59, 6);
    expect(rig.params()[PARAM.far]).toBeCloseTo(0.49, 6);
    expect(rig.commits).toEqual(["Lens Blur: Focal range"]);
  });

  it("moves the focal range with the depth strip and commits on release", () => {
    const rig = start(WITH_DEPTH);
    show(rig);
    const strip = screen.getByRole("slider", { name: "Focal range" });
    Object.defineProperty(strip, "offsetWidth", { value: 200 });
    strip.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40, x: 0, y: 0, toJSON: () => ({}) });
    strip.setPointerCapture = () => undefined;
    fireEvent.pointerDown(strip, { button: 0, clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(strip, { pointerId: 1 });
    expect(rig.params()[PARAM.far]).toBeCloseTo(0.05, 6);
    expect(rig.params()[PARAM.near]).toBeCloseTo(0.15, 6);
    expect(rig.commits).toEqual(["Lens Blur: Focal range"]);
  });

  it("reads the strip's pointer through core's framePoint, under Interface scale", () => {
    const rig = start(WITH_DEPTH);
    const framePoint = vi.spyOn(rig.api.develop, "framePoint");
    show(rig);
    const strip = screen.getByRole("slider", { name: "Focal range" });
    Object.defineProperty(strip, "offsetWidth", { value: 200 });
    strip.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 48, right: 240, bottom: 48, x: 0, y: 0, toJSON: () => ({}) });
    strip.setPointerCapture = () => undefined;
    fireEvent.pointerDown(strip, { button: 0, clientX: 216, pointerId: 1 });
    fireEvent.pointerUp(strip, { pointerId: 1 });
    expect(framePoint).toHaveBeenCalledWith(strip, 216, expect.any(Number));
    expect(rig.params()[PARAM.far]).toBeCloseTo(0.05, 6);
  });
});
