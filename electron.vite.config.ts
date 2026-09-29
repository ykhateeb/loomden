import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    // Do not bundle pi: it loads extensions at runtime with jiti.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/main/index.ts"), agent: resolve("src/agent/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // A sandboxed preload must be CommonJS.
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } },
  },
  renderer: { plugins: [react(), tailwindcss()] },
});
