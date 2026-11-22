// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { LensBlurController, sourceKeyOf, type ControllerHost, type PhotoRecord } from "../src/controller";
import type { DepthEstimator, Pixels } from "../src/depth/estimator";
import { MODEL, downloadModel, loadModel, sha256Hex } from "../src/depth/model-file";
import { DEPTH_DATA_KEY, decodeDepth, encodeDepth } from "../src/depth/photo-data";
import type { ModelStore } from "../src/depth/store";
import type { DepthStroke } from "../src/depth/strokes";
import { PARAM, START_AMOUNT } from "../src/params";
import type { StageTextureData } from "../src/safelight";

const A: PhotoRecord = { id: "0b9c4e1e-1111-4222-8333-944455556666", relPath: "a/IMG_1.CR2", fileSize: 1000, rotation: 0 };
const B: PhotoRecord = { id: "7d1f0000-1111-4222-8333-944455556666", relPath: "a/IMG_2.CR2", fileSize: 2000, rotation: 0 };
const COPY: PhotoRecord = { id: "c0b9c4e1-1111-4222-8333-944455556666", relPath: A.relPath, fileSize: A.fileSize, rotation: 0, copyOf: A.id };
const PIXELS: Pixels = { data: new Uint8ClampedArray(64 * 48 * 4).fill(128), width: 64, height: 48 };
const STROKE: DepthStroke = { dir: 1, amount: 1, feather: 0, dabs: [0.5, 0.5, 0.2] };
const FLAT = (v: number) => ({ width: 16, height: 12, data: new Float32Array(16 * 12).fill(v) });

function modelStore(model: ArrayBuffer | null): ModelStore & { reads: number } {
  let kept = model;
  const s = {
    reads: 0,
    hasModel: async () => kept !== null,
    getModel: async () => {
      s.reads++;
      return kept;
    },
    putModel: async (_: string, bytes: ArrayBuffer) => void (kept = bytes),
    deleteModel: async () => void (kept = null),
  };
  return s;
}

interface RigOptions {
  model?: boolean;
  saved?: Record<string, Record<string, unknown>>;
  data?: Record<string, Uint8Array>;
  estimate?: (p: Pixels) => Promise<ReturnType<typeof FLAT>>;
}

function rig(opts: RigOptions = {}) {
  let open: string | null = A.id;
  const bags: Record<string, Record<string, unknown>> = { [A.id]: {}, [B.id]: {}, [COPY.id]: {} };
  const textures = new Map<string, StageTextureData>();
  const log: string[] = [];
  const estimates: Pixels[] = [];
  const data: Record<string, Uint8Array> = { ...opts.data };
  const estimator: DepthEstimator = {
    estimate: async (p) => {
      estimates.push(p);
      return (opts.estimate ?? (async () => FLAT(0.3)))(p);
    },
    dispose: () => undefined,
  };
  const host: ControllerHost = {
    photo: (id) => [A, B, COPY].find((p) => p.id === id),
    openPhotoId: () => open,
    openBag: () => (open ? bags[open] : {}),
    setBag: (patch) => {
      if (!open) return;
      log.push(`set ${open.slice(0, 2)} ${Object.keys(patch).join(",")}`);
      const next = { ...bags[open], ...patch };
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
      bags[open] = next;
    },
    commit: async (label) => void log.push(`commit ${open?.slice(0, 2)} ${label}`),
    sourcePixels: () => PIXELS,
    renderPixels: vi.fn(async () => ({ data: new Uint8ClampedArray(32 * 24 * 4), width: 32, height: 24 })),
    savedBag: async (id) => opts.saved?.[id] ?? null,
    photoData: async (key, id) => (key === DEPTH_DATA_KEY ? (data[id] ?? null) : null),
    putOpenPhotoData: (key, bytes) => {
      log.push(`keep ${open?.slice(0, 2)}`);
      if (open && key === DEPTH_DATA_KEY) data[open] = bytes;
    },
    setTexture: (id, tex) => {
      if (tex) textures.set(id, tex);
      else textures.delete(id);
    },
    network: { fetch: async () => new Response(new Uint8Array([1])) },
  };
  const store = modelStore(opts.model ? new ArrayBuffer(8) : null);
  const controller = new LensBlurController(host, store, () => estimator);
  return {
    controller,
    host,
    log,
    estimates,
    textures,
    data,
    bag: (id = A.id) => bags[id],
    open: (id: string | null) => (open = id),
    setBag: (id: string, patch: Record<string, unknown>) => (bags[id] = { ...bags[id], ...patch }),
  };
}

const signal = () => new AbortController().signal;
const centre = (t: StageTextureData) => t.data[Math.floor(t.height / 2) * t.width + Math.floor(t.width / 2)];

describe("estimating the open photo's depth", () => {
  it("records the method with a first blur focused on the middle, as one step", async () => {
    const r = rig();
    await r.controller.estimateOpen("simple");
    expect(r.log).toEqual([`set 0b ${[PARAM.method, PARAM.amount, PARAM.near, PARAM.far].join(",")}`, "commit 0b Lens Blur depth"]);
    expect(r.bag()[PARAM.method]).toBe("simple");
    expect(r.bag()[PARAM.amount]).toBe(START_AMOUNT);
  });

  it("keeps a blur already set, changing only the method", async () => {
    const r = rig();
    r.setBag(A.id, { [PARAM.amount]: 30, [PARAM.near]: 0.9 });
    await r.controller.estimateOpen("simple");
    expect(r.bag()[PARAM.amount]).toBe(30);
    expect(r.bag()[PARAM.near]).toBe(0.9);
  });

  it("writes nothing into another photo opened while the estimate ran, and keeps the estimate for its own", async () => {
    let finish!: () => void;
    const r = rig({ model: true, estimate: () => new Promise((resolve) => (finish = () => resolve(FLAT(0.4)))) });
    const running = r.controller.estimateOpen("model");
    await new Promise((resolve) => setTimeout(resolve, 0));
    r.open(B.id);
    finish();
    await running;
    expect(r.bag(B.id)).toEqual({});
    expect(r.bag(A.id)).toEqual({});
    expect(r.log).toEqual([]);
    r.open(A.id);
    await r.controller.estimateOpen("model");
    expect(r.estimates).toHaveLength(1);
    expect(r.bag()[PARAM.method]).toBe("model");
  });

  it("asks for the model before it estimates with it", async () => {
    const r = rig();
    await expect(r.controller.estimateOpen("model")).rejects.toThrow(/isn't downloaded/);
  });
});

describe("the open photo's depth texture", () => {
  it("is set from the photo's own edit, strokes over it, and kept with the photo once for the model", async () => {
    const r = rig({ model: true });
    r.setBag(A.id, { [PARAM.method]: "model" });
    await r.controller.syncOpen();
    const plain = centre(r.textures.get(A.id)!);
    r.setBag(A.id, { [PARAM.refine]: [STROKE] });
    await r.controller.syncOpen();
    expect(centre(r.textures.get(A.id)!)).toBeGreaterThan(plain);
    expect(r.log.filter((l) => l.startsWith("keep"))).toEqual(["keep 0b"]);
    expect(decodeDepth(r.data[A.id], sourceKeyOf(A))?.width).toBe(64);
    expect(r.estimates).toHaveLength(1);
  });

  it("never keeps the simple depth", async () => {
    const r = rig();
    r.setBag(A.id, { [PARAM.method]: "simple" });
    await r.controller.syncOpen();
    expect(r.textures.has(A.id)).toBe(true);
    expect(r.data[A.id]).toBeUndefined();
  });

  it("is let go when another photo opens, and the new one gets its own", async () => {
    const r = rig();
    r.setBag(A.id, { [PARAM.method]: "simple" });
    await r.controller.syncOpen();
    r.open(B.id);
    await r.controller.syncOpen();
    expect([...r.textures.keys()]).toEqual([]);
    r.setBag(B.id, { [PARAM.method]: "simple" });
    await r.controller.syncOpen();
    expect([...r.textures.keys()]).toEqual([B.id]);
  });

  it("isn't set on a photo opened while its depth was made", async () => {
    let finish!: () => void;
    const r = rig({ model: true, estimate: () => new Promise((resolve) => (finish = () => resolve(FLAT(0.4)))) });
    r.setBag(A.id, { [PARAM.method]: "model" });
    const syncing = r.controller.syncOpen();
    await new Promise((resolve) => setTimeout(resolve, 0));
    r.open(B.id);
    finish();
    await syncing;
    expect(r.textures.size).toBe(0);
    expect(r.data[B.id]).toBeUndefined();
  });

  it("waits quietly for the open photo's pixels instead of reporting no depth", async () => {
    const r = rig({ model: true });
    const errors: string[] = [];
    r.controller.onError((e) => errors.push(e));
    const pixels = r.host.sourcePixels;
    r.host.sourcePixels = () => null;
    r.setBag(A.id, { [PARAM.method]: "model" });
    await r.controller.syncOpen();
    expect(errors).toEqual([]);
    expect(r.textures.size).toBe(0);
    r.host.sourcePixels = pixels;
    await r.controller.syncOpen();
    expect(r.textures.has(A.id)).toBe(true);
  });

  it("reports why it couldn't be made", async () => {
    const r = rig();
    const errors: string[] = [];
    r.controller.onError((e) => errors.push(e));
    r.setBag(A.id, { [PARAM.method]: "model" });
    await r.controller.syncOpen();
    expect(errors[0]).toMatch(/isn't downloaded/);
  });
});

describe("another photo's depth, for core's provider", () => {
  it("is made from that photo's own saved edit and its own kept depth", async () => {
    const mine = encodeDepth(FLAT(0.8), sourceKeyOf(B));
    const r = rig({ saved: { [B.id]: { [PARAM.method]: "model", [PARAM.refine]: [STROKE] } }, data: { [B.id]: mine } });
    const tex = await r.controller.provide(B.id, signal());
    expect(tex?.width).toBe(16);
    expect(centre(tex!)).toBeGreaterThan(0.5 + 0.5 * 0.8);
    expect(r.estimates).toHaveLength(0);
  });

  it("borrows nothing from a photo its edit was pasted from: without its own depth it has none", async () => {
    const r = rig({ model: true, saved: { [B.id]: { [PARAM.method]: "model" } }, data: { [A.id]: encodeDepth(FLAT(0.8), sourceKeyOf(A)) } });
    await expect(r.controller.provide(B.id, signal())).rejects.toThrow(/no depth for this photo yet.*open it in Develop/);
    expect(r.estimates).toHaveLength(0);
  });

  it("shares its original's kept depth with a virtual copy, which shares its source", async () => {
    const r = rig({ saved: { [COPY.id]: { [PARAM.method]: "model" } }, data: { [A.id]: encodeDepth(FLAT(0.8), sourceKeyOf(A)) } });
    const tex = await r.controller.provide(COPY.id, signal());
    expect(centre(tex!)).toBeCloseTo(0.9, 3);
  });

  it("reads no depth kept for another source (a rotated or replaced file)", async () => {
    const r = rig({ saved: { [B.id]: { [PARAM.method]: "model" } }, data: { [B.id]: encodeDepth(FLAT(0.8), "other") } });
    await expect(r.controller.provide(B.id, signal())).rejects.toThrow(/no depth/);
  });

  it("makes the simple depth from a rendering of the photo", async () => {
    const r = rig({ saved: { [B.id]: { [PARAM.method]: "simple" } } });
    const tex = await r.controller.provide(B.id, signal());
    expect(r.host.renderPixels).toHaveBeenCalledWith(B.id);
    expect(tex?.width).toBe(32);
  });

  it("refuses a photo whose blur was pasted without any depth of its own, saying so", async () => {
    const r = rig({ saved: { [B.id]: { [PARAM.amount]: 40, [PARAM.near]: 0.6 } } });
    await expect(r.controller.provide(B.id, signal())).rejects.toThrow(/no depth for this photo yet.*open it in Develop/);
  });

  it("is none for a photo without a Lens Blur", async () => {
    const r = rig({ saved: { [B.id]: { [PARAM.near]: 0.6 } } });
    expect(await r.controller.provide(B.id, signal())).toBeNull();
    expect(await r.controller.provide("no-such-photo", signal())).toBeNull();
  });
});

describe("the depth model", () => {
  it("is checked for without being read", async () => {
    const store = modelStore(new ArrayBuffer(8));
    const r = new LensBlurController(rig().host, store, () => {
      throw new Error("no estimator");
    });
    expect(await r.hasModel()).toBe(true);
    expect(store.reads).toBe(0);
  });

  it("is checked again when loaded, and a damaged copy is thrown away", async () => {
    const store = modelStore(new Uint8Array([9, 9, 9]).buffer);
    await expect(loadModel(store)).rejects.toThrow(/damaged/);
    expect(await store.hasModel(MODEL.sha256)).toBe(false);
  });

  it("refuses a download that isn't the file expected, and says why one failed", async () => {
    const store = modelStore(null);
    await expect(downloadModel({ fetch: async () => new Response(new Uint8Array([1, 2, 3])) }, store)).rejects.toThrow(/isn't the expected file/);
    await expect(downloadModel({ fetch: async () => Promise.reject(new TypeError("offline")) }, store)).rejects.toThrow(/offline/);
    await expect(downloadModel({ fetch: async () => new Response("", { status: 404 }) }, store)).rejects.toThrow(/404/);
    expect(await sha256Hex(new Uint8Array([]).buffer)).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("depth kept with a photo", () => {
  it("reads back what was kept, for the same source only", () => {
    const map = { width: 3, height: 2, data: new Float32Array([0, 0.25, 0.5, 0.75, 1, 0.1]) };
    const back = decodeDepth(encodeDepth(map, "src"), "src")!;
    expect(back.width).toBe(3);
    for (let i = 0; i < 6; i++) expect(back.data[i]).toBeCloseTo(map.data[i], 4);
    expect(decodeDepth(encodeDepth(map, "src"), "other")).toBeNull();
    expect(decodeDepth(new Uint8Array([1, 2, 3]), "src")).toBeNull();
  });
});

describe("syncing the open photo", () => {
  it("loses no change made while a sync finishes", async () => {
    const r = rig();
    const first = r.controller.syncOpen();
    r.setBag(A.id, { [PARAM.method]: "simple" });
    void r.controller.syncOpen();
    await first;
    await r.controller.syncOpen();
    expect(r.textures.has(A.id)).toBe(true);
  });
});
