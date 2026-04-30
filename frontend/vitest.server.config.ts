import { defineConfig } from "vitest/config";
import path from "path";

/** Server (Node) tests under `server/test/` — no jsdom / React setup. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    name: "backend",
    globals: true,
    environment: "node",
    include: ["server/test/**/*.test.{ts,tsx}"],
  },
});
