import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Split framework code out of the app chunk so nothing stays large; the map
// (pixi) and the advanced drawer are already dynamic imports loaded after login.
//
// `pixi` is listed separately from the map itself: nothing in the eager graph
// imports pixi.js, so the chunk is still only fetched when `map.ts` is, but the
// renderer's own code no longer shares a file with the ~470 KiB library. That
// keeps map work off the 500 KiB per-chunk gate and gives pixi a stable hash
// across releases instead of a new one every time the renderer changes.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          shared: ["@kingdoms/shared"],
          pixi: ["pixi.js"],
        },
      },
    },
  },
});