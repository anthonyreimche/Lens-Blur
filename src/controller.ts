// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// Each photo's depth, from the estimate to the texture the stage draws with.
//
// The depth texture is per photo: every frame of a photo, in Develop,
// thumbnails, exports and headless renders, draws the variant named by the
// photo's own id. The open photo's is set as it is edited (syncOpen); core
// asks provide() for any other photo's when a frame needs it. Either way a
// photo's depth is made from its own edit (its method and refine strokes) and
// its own source: an edit pasted from another photo names nothing of that
// photo's, and a photo with no depth of its own draws none.
//
// The model's estimate is kept with the photo (photo-data.ts); a virtual copy
// shares its original's, since they share a source. The simple depth is made
// again whenever it is needed.

import { autoBand, depthHistogram } from "./model";
import { depthTexture, type DepthMap } from "./depth/map";
import { WorkerEstimator, fitTo, simpleDepthFor, type DepthEstimator, type DepthMethod, type Pixels } from "./depth/estimator";
import { MODEL, downloadModel, loadModel } from "./depth/model-file";
import { DEPTH_DATA_KEY, decodeDepth, encodeDepth } from "./depth/photo-data";
import type { ModelStore } from "./depth/store";
import { applyStrokes, readStrokes, type DepthStroke } from "./depth/strokes";
import { PARAM, START_AMOUNT, methodOf, readParams } from "./params";
import type { CatalogPhoto, NetworkAPI, StageTextureData } from "./safelight";

export type PhotoRecord = Pick<CatalogPhoto, "id" | "copyOf" | "relPath" | "fileSize" | "rotation">;
type Bag = Readonly<Record<string, unknown>>;

/** What the controller needs of Safelight (index.tsx wires the real API). */
export interface ControllerHost {
  photo(id: string): PhotoRecord | undefined;
  openPhotoId(): string | null;
  openBag(): Bag;
  setBag(patch: Record<string, unknown>): void;
  commit(label: string): Promise<void>;
  /** The open photo's source, about 1024 px on its long edge. */
  sourcePixels(): Pixels | null;
  /** A small rendering of a photo that isn't open. */
  renderPixels(photoId: string): Promise<Pixels | null>;
  /** The bag of a photo's saved edit. */
  savedBag(photoId: string): Promise<Bag | null>;
  /** What this extension keeps with a photo, under `key`. */
  photoData(key: string, photoId: string): Promise<Uint8Array | null>;
  /** Keeps `data` with the open photo. */
  putOpenPhotoData(key: string, data: Uint8Array): void;
  /** Sets the depth variant of photo `photoId`, or clears it. */
  setTexture(photoId: string, data: StageTextureData | null): void;
  network: Pick<NetworkAPI, "fetch">;
}

export function sourceKeyOf(photo: PhotoRecord): string {
  return `${photo.copyOf ?? photo.id}|${photo.relPath}|${photo.fileSize}|${photo.rotation ?? 0}`;
}

const KEPT_IN_MEMORY = 6;

const NO_DEPTH_YET = "Lens Blur has no depth for this photo yet: open it in Develop to estimate it.";

/** The open photo's depth can't be made before its pixels arrive; a sync
 *  then waits for them rather than reporting it. */
class AwaitingPixels extends Error {
  constructor() {
    super("The photo is still loading.");
  }
}

/** What the open photo's depth texture was last set from. */
interface Shown {
  photoId: string;
  sig: string;
  map: DepthMap;
}

export class LensBlurController {
  private readonly bases = new Map<string, DepthMap>();
  private readonly making = new Map<string, Promise<DepthMap>>();
  private readonly kept = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly errorListeners = new Set<(message: string) => void>();
  private estimator: DepthEstimator | null = null;
  private shown: Shown | null = null;
  private version = 0;
  private syncing: Promise<void> | null = null;
  private syncAgain = false;

  constructor(
    private readonly host: ControllerHost,
    private readonly store: ModelStore,
    private readonly makeEstimator: (load: () => Promise<ArrayBuffer>) => DepthEstimator = (loadModel) => new WorkerEstimator({ loadModel }),
  ) {}

  /** Calls `listener` when the open photo's depth changes; returns the unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Calls `listener` with the reason the open photo's depth couldn't be made. */
  onError(listener: (message: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }

  /** Whether the depth model is downloaded (without reading it). */
  hasModel(): Promise<boolean> {
    return this.store.hasModel(MODEL.sha256).catch(() => false);
  }

  /** Downloads the depth model; the person asked for it. */
  downloadModel(): Promise<void> {
    return downloadModel(this.host.network, this.store);
  }

  private remember(key: string, map: DepthMap): void {
    this.bases.delete(key);
    this.bases.set(key, map);
    while (this.bases.size > KEPT_IN_MEMORY) this.bases.delete(this.bases.keys().next().value as string);
  }

  /** `photo`'s depth by `method`, before strokes: from memory, kept with the
   *  photo (or its original), or made now. The model's is made only for the
   *  open photo, from `pixels`; another photo without one has none. */
  private base(photo: PhotoRecord, method: DepthMethod, pixels: Pixels | null): Promise<DepthMap> {
    const key = `${method}|${sourceKeyOf(photo)}`;
    const held = this.bases.get(key);
    if (held) {
      this.remember(key, held);
      return Promise.resolve(held);
    }
    const running = this.making.get(key);
    if (running) return running;
    const made = this.make(photo, method, pixels);
    this.making.set(key, made);
    made.then(
      (map) => {
        this.making.delete(key);
        this.remember(key, map);
      },
      () => this.making.delete(key),
    );
    return made;
  }

  private async make(photo: PhotoRecord, method: DepthMethod, pixels: Pixels | null): Promise<DepthMap> {
    const open = photo.id === this.host.openPhotoId();
    if (method === "simple") {
      if (open && !pixels) throw new AwaitingPixels();
      const source = pixels ?? (await this.host.renderPixels(photo.id));
      if (!source) throw new Error("Lens Blur couldn't read the photo to make its depth.");
      return simpleDepthFor(source);
    }
    const sourceKey = sourceKeyOf(photo);
    for (const id of photo.copyOf ? [photo.id, photo.copyOf] : [photo.id]) {
      const kept = decodeDepth(await this.host.photoData(DEPTH_DATA_KEY, id).catch(() => null), sourceKey);
      if (kept) {
        if (id === photo.id) this.kept.add(`${photo.id}|${sourceKey}`);
        return kept;
      }
    }
    if (!pixels) throw open ? new AwaitingPixels() : new Error(NO_DEPTH_YET);
    if (!(await this.hasModel())) throw new Error("Lens Blur's depth model isn't downloaded yet: choose Estimate depth in its panel.");
    this.estimator ??= this.makeEstimator(() => loadModel(this.store));
    return fitTo(await this.estimator.estimate(pixels), pixels);
  }

  /** The texture for photo `photoId`'s variant, for core's provider: made from
   *  that photo's own edit, or null for a photo without Lens Blur's depth. */
  readonly provide = async (photoId: string, signal: AbortSignal): Promise<StageTextureData | null> => {
    const photo = this.host.photo(photoId);
    if (!photo) return null;
    const open = photoId === this.host.openPhotoId();
    const bag = open ? this.host.openBag() : await this.host.savedBag(photoId);
    const method = methodOf(bag);
    // Paste and sync carry the blur's values but not the method: a blur with
    // no depth of this photo's own is refused, never drawn unblurred.
    if (!method) {
      if (readParams(bag ?? {}).amount >= 0.5) throw new Error(NO_DEPTH_YET);
      return null;
    }
    const base = await this.base(photo, method, open ? this.host.sourcePixels() : null);
    if (signal.aborted) return null;
    return depthTexture(applyStrokes(base, readStrokes(bag?.[PARAM.refine])));
  };

  /** Sets the open photo's depth texture from its edit, when that changed:
   *  call it on every change of the open photo or its edit. One sync runs at
   *  a time; changes meanwhile run one more. */
  syncOpen(): Promise<void> {
    this.syncAgain = true;
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      while (this.syncAgain) {
        this.syncAgain = false;
        try {
          await this.syncOnce();
        } catch (e) {
          if (e instanceof AwaitingPixels) continue;
          const message = e instanceof Error ? e.message : String(e);
          for (const l of this.errorListeners) l(message);
        }
      }
      // No await between the last check and this: a call meanwhile can't be lost.
      this.syncing = null;
    })();
    return this.syncing;
  }

  private async syncOnce(): Promise<void> {
    const id = this.host.openPhotoId();
    if (this.shown && this.shown.photoId !== id) {
      this.host.setTexture(this.shown.photoId, null);
      this.shown = null;
      this.changed();
    }
    const photo = id ? this.host.photo(id) : undefined;
    const bag = this.host.openBag();
    const method = methodOf(bag);
    if (!photo || !method) {
      if (this.shown) {
        this.host.setTexture(this.shown.photoId, null);
        this.shown = null;
        this.changed();
      }
      return;
    }
    const strokes = readStrokes(bag[PARAM.refine]);
    const sourceKey = sourceKeyOf(photo);
    const sig = `${method}|${sourceKey}|${JSON.stringify(strokes)}`;
    if (this.shown?.sig === sig) return;
    const base = await this.base(photo, method, this.host.sourcePixels());
    if (this.host.openPhotoId() !== photo.id) return;
    const map = applyStrokes(base, strokes);
    this.host.setTexture(photo.id, { ...depthTexture(map), version: ++this.version });
    this.shown = { photoId: photo.id, sig, map };
    if (method === "model" && !this.kept.has(`${photo.id}|${sourceKey}`)) {
      this.host.putOpenPhotoData(DEPTH_DATA_KEY, encodeDepth(base, sourceKey));
      this.kept.add(`${photo.id}|${sourceKey}`);
    }
    this.changed();
  }

  private openPhoto(): PhotoRecord {
    const id = this.host.openPhotoId();
    const photo = id ? this.host.photo(id) : undefined;
    if (!photo) throw new Error("Open a photo in Develop first.");
    return photo;
  }

  /** The open photo's depth method. */
  openMethod(): DepthMethod | null {
    return methodOf(this.host.openBag());
  }

  /** Makes the open photo's depth by `method` and records the method in its
   *  edit, as one undo step. A photo without a blur yet gets the starting
   *  amount, focused on what lies at the middle of the frame. When another
   *  photo is open by the time the depth is made, it is kept for the photo it
   *  was made for and nothing is written. */
  async estimateOpen(method: DepthMethod): Promise<void> {
    const photo = this.openPhoto();
    const pixels = this.host.sourcePixels();
    if (!pixels) throw new Error("The photo is still loading: try again in a moment.");
    const base = await this.base(photo, method, pixels);
    if (this.host.openPhotoId() !== photo.id) return;
    const bag = this.host.openBag();
    const patch: Record<string, unknown> = { [PARAM.method]: method };
    if (readParams(bag).amount === 0) {
      const band = autoBand(applyStrokes(base, readStrokes(bag[PARAM.refine])));
      Object.assign(patch, { [PARAM.amount]: START_AMOUNT, [PARAM.near]: band.near, [PARAM.far]: band.far });
    }
    this.host.setBag(patch);
    await this.host.commit("Lens Blur depth");
  }

  /** Writes the open photo's refine strokes; ends the undo step when
   *  `commit` is given. */
  async refine(strokes: DepthStroke[], commit?: string): Promise<void> {
    this.openPhoto();
    this.host.setBag({ [PARAM.refine]: strokes.length > 0 ? strokes : undefined });
    if (commit) await this.host.commit(commit);
  }

  /** The open photo's depth as drawn (strokes laid over), once set; null
   *  otherwise. For picking the focus and drawing the histogram. */
  openMap(): DepthMap | null {
    return this.shown && this.shown.photoId === this.host.openPhotoId() ? this.shown.map : null;
  }

  histogram(bins: number): number[] | null {
    const map = this.openMap();
    return map ? depthHistogram(map, bins) : null;
  }

  dispose(): void {
    if (this.shown) this.host.setTexture(this.shown.photoId, null);
    this.estimator?.dispose();
    this.estimator = null;
    this.listeners.clear();
    this.errorListeners.clear();
    this.bases.clear();
    this.shown = null;
  }
}
