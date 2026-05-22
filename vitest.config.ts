import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // PGlite-WASM initialization is heavy; serialize test files so multiple
    // PGlite instances don't compete for the same worker resources.
    fileParallelism: false,
  },
});
