import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const entry = fileURLToPath(new URL("src/browser.ts", import.meta.url));

// Builds the `@zksoroban/sdk/browser` entry point as a single, dependency-free
// ES module — everything it needs (including snarkjs's own `browser` build)
// is bundled in, so it can be dropped into a plain HTML page with a single
// `<script type="module">` and no separate node_modules resolution. See
// docs/browser-proof-generation.md for a full usage example.
export default defineConfig({
  build: {
    outDir: "dist/browser",
    emptyOutDir: true,
    lib: {
      entry,
      formats: ["es"],
      fileName: () => "index.mjs"
    },
    rollupOptions: {
      output: {
        // Force a single output file instead of splitting snarkjs's own
        // dynamic imports into a separate chunk, so the whole bundle is one
        // <script type="module"> away from working.
        codeSplitting: false
      }
    }
  }
});
