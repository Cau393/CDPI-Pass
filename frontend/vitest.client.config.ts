import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/** Client (browser) tests under `client/src/test/` — jsdom + React. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  oxc: {
    jsx: "automatic",
  },
  test: {
    name: "frontend",
    globals: true,
    environment: "jsdom",
    setupFiles: ["./client/src/test/setup.ts"],
    include: ["client/src/test/**/*.test.{ts,tsx}"],
  },
});
