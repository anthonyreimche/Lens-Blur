// Checks on dist/, the files Safelight loads. Safelight imports dist/index.js
// as it is, without an import map, so it must not import anything at
// runtime; the depth worker inlined in it loads ONNX Runtime from dist/ort.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Not `new URL("../dist/index.js", import.meta.url)`: Vite recognizes that
// exact pattern as an asset import and rewrites it against the test
// environment's http://localhost location instead of the real file.
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const BUNDLE = join(DIST, "index.js");
const RUNTIME = ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

describe("built bundle (run `npm run build` first)", () => {
  it("exists", () => {
    expect(existsSync(BUNDLE)).toBe(true);
  });

  it("imports nothing itself: only the inlined depth worker loads the runtime", () => {
    const src = readFileSync(BUNDLE, "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
    const dynamic = src.match(/\bimport\s*\(/g) ?? [];
    expect(dynamic).toHaveLength(1);
    expect(src).toMatch(/import\(\\n\/\* @vite-ignore \*\/\\n\w+\.ortUrl\)/);
  });

  it("never imports React: the host passes it in", () => {
    const src = readFileSync(BUNDLE, "utf8");
    expect(/from\s*["']react(-dom)?(\/[^"']*)?["']/.test(src)).toBe(false);
    expect(src.includes("jsx-runtime")).toBe(false);
  });

  it("never reads import.meta: it is undefined in an installed extension", () => {
    expect(readFileSync(BUNDLE, "utf8").includes("import.meta")).toBe(false);
  });

  it("ships the WebAssembly runtime the worker loads", () => {
    const src = readFileSync(BUNDLE, "utf8");
    for (const name of RUNTIME) expect(existsSync(join(DIST, "ort", name))).toBe(true);
    expect(src).toContain("ort.wasm.min.mjs");
  });
});
