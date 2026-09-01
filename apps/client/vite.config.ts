import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Split framework code out of the app chunk so nothing stays large; the map
// (pixi) and the advanced drawer are already dynamic imports loaded after login.
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
        },
      },
    },
  },
});