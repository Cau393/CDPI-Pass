import { defineConfig } from "vitest/config";

/**
 * Default Vitest entry: runs both client (jsdom) and server (node) projects.
 * For isolated runs, use `npm run test:frontend` or `npm run test:backend`.
 */
export default defineConfig({
  test: {
    projects: ["vitest.client.config.ts", "vitest.server.config.ts"],
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
