# Lens Blur for Safelight

A [Safelight](https://github.com/anthonyreimche/SafeLight) extension that
gives a photo a shallow depth of field after the fact. It works out how far
away each part of the photo is, then blurs everything outside the distance
you pick, the way a wide-open lens would have: the background melts away
behind a sharp subject, things in front of it soften and spill over its edges,
and bright points bloom into bokeh.

## Using it

Open a photo in Develop and find the **Lens Blur** panel.

1. Choose **Estimate depth**. The first time, this downloads the depth model
   (about 27 MB) and keeps it, so you only wait for it once. After that a
   photo takes a few seconds, and its depth is kept too: reopening or
   exporting it doesn't estimate it again. **Simple depth** skips the model
   and uses a depth that runs from far at the top of the photo to near at the
   bottom, which suits a landscape or a table top and is a starting point to
   paint over.
2. The blur starts at 50, focused on whatever is in the middle of the frame.
   Click **Pick** and then click the photo to focus somewhere else, or drag a
   box to keep everything in it sharp.
3. Set the **Blur amount**, the **Bokeh** shape and **Boost**.

### The controls

- **Blur amount** (0 to 100): the largest blur, reached by what lies far
  outside the focal range. At 100 a disc is 5% of the photo's long edge
  across. At 0 nothing is drawn and nothing is spent.
- **Bokeh**: the shape bright out-of-focus points take. **Circle** is an
  evenly lit disc, **Bubble** has a bright rim, **5 blades** is a rounded
  pentagon, **Ring** is hollow, as from a mirror lens, and **Cat eye** narrows
  toward the frame's edges, as a fast lens's bokeh does.
- **Boost** (0 to 100): brightens the brightest highlights before they blur,
  up to eight times at 100, judged on the light of small patches (a 2048th of
  the photo's long edge), so the preview and a full-size export agree. It
  only acts where the blur is clearly visible, so what is in focus or barely
  blurred never brightens. A
  clipped highlight lost most of its light to the
  clipping, and Boost gives some of it back, so street lights and sparkles
  bloom into bright discs instead of grey smudges.
- **Focal range**: the strip shows how much of the photo lies at each
  distance, nearest on the left, with the range that stays sharp lit. Drag
  its edges to widen or narrow it, drag the range to move it, or click
  elsewhere on the strip to focus there.
- **Refine depth**: when the estimate gets something wrong (a gap between
  branches, a hand that reads as the background), paint over it with
  **Nearer** or **Further**. Each stroke moves the depth under the brush by
  up to a quarter of the way from far to near, set by **Strength**; paint
  again to move it further. **Size** and **Feather** set the brush. **Clear**
  removes every stroke.
- **Show depth** paints the depth over the photo: warm is near, blue is far,
  and the focal range is lit. It only changes the view, never the edit.
- The menu beside it says how the depth was made, and switches between the
  estimate and the simple depth.

Everything is part of the photo's edit: it undoes and exports exactly as you
see it. Presets leave it out unless you choose to include it, since a focal
range belongs to one photo. Pasting or syncing the settings onto another photo
brings the blur and the focal range, but never the first photo's depth: each
photo draws with a depth of its own. A photo pasted onto has its
depth estimated when you open it in Develop; exporting it before then fails
with a note saying so.

Each estimated depth is saved with its photo in the project, so `safelight`
on the command line exports it too. It can't make a new estimate, though: the
model lives in the app's own storage, which the command line doesn't see.

## How it works

**Depth.** The estimate comes from Depth Anything V2 Small (Yang et al., 2024),
a monocular depth network, in the 8-bit version onnx-community converted to
ONNX. It runs in a worker with ONNX Runtime Web on WebAssembly, so any computer
can run it, graphics card or not: about 1.5 s on four cores of a recent
desktop processor, and 3.5 to 10 s on one. The extension ships the runtime
(15 MB) and downloads the model once, from a fixed revision on Hugging Face,
only when you first click Estimate depth, then checks it against its SHA-256
before using it. The network permission it declares covers only that download.
The model sees the photo at 518 px on its short side and answers in relative
disparity (inverse distance), which is spread between its 1st and 99th
percentiles to run from 0 (farthest) to 1 (nearest), then scaled to the
photo's frame at up to 1024 px. Each photo's map is saved with the photo
(1.4 MB at most, beside the catalogue, not in it), tied to its file and
rotation; a virtual copy uses its original's. The simple depth is never saved:
it costs nothing to make again. The model is read only when an estimate runs,
in a worker that ends after a minute without work.

I also tried pulling the map's edges onto the photo's with a guided filter.
It bled a black penguin into the dark water behind it, so the model's own
edges are kept.

**Optics.** Disparity is the right axis for a lens: the circle of confusion
grows in proportion to how far a point's disparity is from the focus. Here the
radius is the full blur amount times the distance past the focal range,
reaching the full radius 0.35 beyond it. Points behind the range get a
positive circle, points in front a negative one. Everything is scene-linear
(the stage runs early in the scene-linear phase, after white balance and
exposure, which commute with a blur), so light adds up as it would through a
lens.

**On the GPU.** The blur is a gather in four passes, all on the graphics card:

1. Two pyramids of the image are built, one level per draw, in halves of one
   target: a background pyramid whose texels lean toward the farthest of the
   four they merge, and a foreground pyramid that leans toward the nearest.
   Each texel keeps its disparity in alpha. Boost is applied on the way in.
2. Each pixel gathers two fields with 16 taps each, spiralled and turned a
   little from pixel to pixel. The **background field** is gathered over the
   pixel's own circle, from taps whose own circles reach it. A tap farther
   away than the pixel spreads no wider than the pixel does, and taps are read
   from the far-leaning pyramid, so the background never washes over a sharp
   subject. The **foreground field** is gathered from nearer taps whose
   circles cover the pixel. Their coverage becomes the foreground's opacity,
   so a blurred foreground spills over a sharp edge and turns see-through at
   its own edges, showing what lies behind it. The search radius comes from
   the nearest depth in the neighbourhood, read off a coarse level of the
   foreground pyramid. Taps read the level whose texels are about as far
   apart as the taps.
3. A small tent filter, weighted by how blurred each pixel is, smooths the
   grain the spiral leaves without reaching into what stays sharp.
4. The stage's inline code mixes the result over the photo by how much each
   pixel is blurred. Wherever nothing blurs a pixel, it is left exactly as it
   was.

The blur is measured against the frame's long edge, so Develop's preview, the
thumbnails and a full-size export blur the same share of the picture. The
depth map is a texture of each photo's own: every frame of a photo draws the
one filed under that photo, which core asks the extension for (made from that
photo's edit and its saved depth) whenever a frame needs it, and an export
waits for it. Dragging the focus or changing the shape redraws only the gather; the
pyramid is kept. A draw reads at most 41 texels a pixel.

**Where it differs from the reference.** The feature set follows the Lens
Blur tool photographers know from the big raw editors: blur amount, bokeh
shapes, boost, a focal range picked on the photo or on a depth histogram, depth
painted nearer or further, and a depth view. This version doesn't do:

- **Subject detection.** A new photo focuses on the middle of the frame.
- **Focus and Blur brushes.** It paints depth, not blur directly.
- **Depth from the camera.** It doesn't read the depth maps some phones store
  in HEIC or portrait-mode JPEG files; every photo is estimated.
- **Optical vignetting.** The cat eye keeps its brightness toward the corners
  instead of darkening with it.

Its bokeh is a gather, not a scatter of shapes, so a single highlight's disc
is soft-edged rather than crisp. Masks don't apply to it. The blur's edges
follow the estimated depth, so where the model draws a crowd or foliage as one
blocky shape the blur shows that shape too; paint over it with Nearer or
Further.

## Credits and licences

- **Depth Anything V2 Small**, by Lihe Yang, Bingyi Kang, Zilong Huang,
  Zhen Zhao, Xiaogang Xu, Jiashi Feng and Hengshuang Zhao, under the
  Apache License 2.0. The ONNX conversion is by onnx-community. The model is
  downloaded at first use and isn't part of this repository.
- **ONNX Runtime Web**, by Microsoft, under the MIT licence, shipped in
  `dist/ort`. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Lens Blur itself is under the GNU GPL v3 or later; see [LICENSE](LICENSE).

## Development

```
npm run check       # typecheck, build, unit tests
npm run test:gpu    # the stage on Safelight's renderer, in a SafeLight checkout
```

It needs Safelight 3.2.7, whose stage passes can sample a stage texture.
