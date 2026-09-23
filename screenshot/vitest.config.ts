import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The renderer test launches a real Chromium once per file.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
