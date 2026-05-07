import { resolve } from "node:path";
import { defineConfig } from "vite";
import protocPlugin from "./vite-protoc-plugin.js";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        popup: resolve(import.meta.dirname, "popup.html"),
        "service-worker": resolve(import.meta.dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
  plugins: [protocPlugin()],
});
