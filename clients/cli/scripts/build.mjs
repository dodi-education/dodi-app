// Bundle the CLI into dist/ with the workspace packages (@dodi/*, plain TS
// source) inlined, so `npm install -g @dodi-education/cli` works without the monorepo. Playwright
// stays external: it is optional and only loaded by `dodi games check --local`.
import { readFileSync } from "node:fs";

import { build } from "esbuild";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: { dodi: "src/index.ts" },
  outdir: "dist",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["playwright", "yaml"],
  banner: { js: "#!/usr/bin/env node" },
  define: { __DODI_CLI_VERSION__: JSON.stringify(version) },
  logLevel: "info",
});
