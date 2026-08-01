import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("pdfjs-dist")) return "pdfjs";
          if (id.includes("@xyflow")) return "xyflow";
          if (id.includes("konva")) return "canvas";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("@tauri-apps")) return "tauri";
          if (id.includes("i18next")) return "i18n";
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "react";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
