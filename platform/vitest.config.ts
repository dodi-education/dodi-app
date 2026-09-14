import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" -> "./src/*" path alias so route/service tests
    // can import (and mock) modules the same way the app code does.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Every DB-backed file boots its own PGlite (WASM Postgres) in beforeAll and
    // applies the migrations; ~1s alone, but well past the 10s default once a
    // dozen of them boot in parallel.
    hookTimeout: 60_000,
  },
});
