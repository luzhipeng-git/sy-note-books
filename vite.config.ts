import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
const hmrHost = process.env.VITE_HMR_HOST || host;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force all packages to resolve @plait/core to the SAME installed copy.
    // Without dedupe, Vite pre-bundling creates separate copies of @plait/core
    // for @plait-board/react-board and the @plait/* plugin packages, each with
    // their own WeakMap instances (BOARD_TO_HOST, KEY_TO_ELEMENT_MAP, etc.).
    // The Board component sets WeakMaps in one copy, plugins read from another.
    dedupe: ['@plait/core', '@plait/common'],
  },

  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: hmrHost && hmrHost !== "0.0.0.0"
      ? {
          protocol: "ws",
          host: hmrHost,
          port: 5174,
        }
      : host === "0.0.0.0"
        ? {
            protocol: "ws",
            host: "10.221.0.15",
            port: 5174,
          }
        : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_ENV_*"],

  optimizeDeps: {
    // Force all @plait packages to share a single @plait/core chunk.
    // @drawnix/drawnix -> @plait-board/react-board -> @plait/core creates a separate
    // bundled copy of WeakMaps (BOARD_TO_ROUGH_SVG etc) that diverges from the copy
    // used by @plait/draw, @plait/mind, etc. Listing the deep dependency chain here
    // forces Vite to pre-bundle them together into a shared chunk.
    include: [
      '@plait/core',
      '@plait/common',
      '@plait/draw',
      '@plait/mind',
      '@plait/text-plugins',
      '@plait/layouts',
      '@plait-board/react-board',
      '@plait-board/react-text',
      '@drawnix/drawnix',
    ],
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    exclude: ["node_modules", "e2e", "e2e-tests"],
  },
}));
