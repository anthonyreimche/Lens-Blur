// Copies the ONNX Runtime Web files the depth worker loads into dist/ort,
// beside the bundle: the WebAssembly build's module, its threaded glue and its
// binary (CPU only; the WebGPU build is twice the size), without the source
// map comments, whose maps aren't shipped. Its MIT licence is in
// THIRD-PARTY-NOTICES.md.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "onnxruntime-web", "dist");
const to = join(root, "dist", "ort");
mkdirSync(to, { recursive: true });
for (const name of ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs"]) {
  writeFileSync(join(to, name), readFileSync(join(from, name), "utf8").replace(/\n?\/\/# sourceMappingURL=.*$/gm, ""));
}
copyFileSync(join(from, "ort-wasm-simd-threaded.wasm"), join(to, "ort-wasm-simd-threaded.wasm"));
console.log("Copied onnxruntime-web into dist/ort.");
