import { resolve } from "node:path";
import { defineConfig } from "vite";
import protocPlugin from "./vite-protoc-plugin.js";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rolldownOptions: {
      input: {
        "content-script": resolve(import.meta.dirname, "src/content/content-script.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
      },
    },
  },
  publicDir: false,
  plugins: [protocPlugin()],
});
