import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Node by default; browser-side modules (local storage, fetch to the
    // page's own routes) opt into jsdom with a `@vitest-environment` pragma.
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});
