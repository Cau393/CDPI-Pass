import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/** Suppress dev-only noise: aborted fetches/HMR still reject with AbortError; overlay is misleading. */
function showRuntimeErrorInOverlay(error: Error): boolean {
  if (error.name === "AbortError") return false;
  if (error.message === "The operation was aborted.") return false;
  return true;
}

/**
 * A production build without the Turnstile site key ships a client that sends no token, and the server (fail
 * closed in production) answers 403 to every guest and card order (ADR-017). Failing the build stops the deploy
 * before the cutover, so the running app keeps serving.
 */
function requireTurnstileSiteKey(): Plugin {
  return {
    name: "require-turnstile-site-key",
    apply: "build",
    configResolved(config) {
      if (config.mode === "production" && !String(config.env.VITE_TURNSTILE_SITE_KEY ?? "").trim()) {
        throw new Error(
          "VITE_TURNSTILE_SITE_KEY is not set in frontend/.env. Production builds need the Turnstile site key " +
            "(ADR-017); for a local build use Cloudflare's test key 1x00000000000000000000AA.",
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    requireTurnstileSiteKey(),
    react(),
    runtimeErrorOverlay({ filter: showRuntimeErrorInOverlay }),
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
  // Env files are read from frontend/, the server's .env, not from the root (client/). Only VITE_ keys reach the bundle.
  envDir: import.meta.dirname,
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
