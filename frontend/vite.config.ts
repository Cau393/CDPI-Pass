import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // String shorthand for simple cases: http://localhost:5173/api -> http://localhost:8000/api
      '/api': {
        target: 'http://127.0.0.1:8000', // <-- YOUR DJANGO SERVER ADDRESS
        changeOrigin: true, // Needed for virtual hosted sites
        secure: false,      // Set to false if Django is running on HTTP, true for HTTPS
        // Optional: Rewrite path if needed, but usually not necessary if Django URLs start with /api/
        // rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  },
});
