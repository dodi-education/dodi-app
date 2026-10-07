import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit and port-contract tests run under Node with the native modules faked
// per test (see src/test-support). The alias mirrors tsconfig's `@/*`.
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url).href),
    },
  },
});
