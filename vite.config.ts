import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const manifest = JSON.parse(readFileSync(new URL("./safelight.json", import.meta.url), "utf8")) as { version: string };

// Classic JSX bound to the `React` each module imports from ./rt: the host's
// React instance, never a bundled one (a second React breaks hooks, and an
// import of "react" left in the bundle fails to load).
const JSX = { runtime: "classic", pragma: "React.createElement", pragmaFrag: "React.Fragment" } as const;

export default defineConfig({
  oxc: { jsx: JSX },
  define: { __EXT_VERSION__: JSON.stringify(manifest.version) },
  build: {
    lib: { entry: "src/index.tsx", formats: ["es"], fileName: "index" },
    rollupOptions: { external: ["react", "react-dom"] },
    outDir: "dist",
    sourcemap: true,
  },
  plugins: [
    {
      // The depth worker is inlined into the bundle (estimator.ts); the map
      // Vite emits beside it would be a file nothing loads.
      name: "drop-inline-worker-map",
      generateBundle(_, bundle) {
        for (const name of Object.keys(bundle)) if (/^assets\/depth-worker-.*\.map$/.test(name)) delete bundle[name];
      },
    },
  ],
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    // The GPU spec runs inside a SafeLight checkout (npm run test:gpu).
    exclude: ["test/gpu/**", "node_modules/**"],
    environment: "jsdom",
  },
});
