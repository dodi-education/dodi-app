#!/usr/bin/env node
/**
 * Regenerate the kid-avatar image assets (repeatable).
 *
 *   Source: clients/web/public/avatars/<id>.png   (410x410 RGBA, ~120-300 KB each)
 *   Output: clients/web/src/assets/avatars/<id>.webp (256x256, alpha, q80, ~8-15 KB)
 *
 * The .webp files are imported as ES modules in src/lib/avatars.ts, so Next emits
 * them as content-hashed, immutably-cached static assets served straight from the
 * CDN — never through the /_next/image optimization endpoint.
 *
 * Run:  node clients/web/scripts/optimize-avatars.mjs
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, ".."); // clients/web
const repoRoot = path.resolve(webRoot, "../.."); // monorepo root

// sharp ships in the pnpm store (a transitive dep of Next) but isn't hoisted into
// clients/web, so fall back to resolving it from node_modules/.pnpm.
function loadSharp() {
  try {
    return require("sharp");
  } catch {
    const pnpm = path.join(repoRoot, "node_modules/.pnpm");
    const dir = readdirSync(pnpm).find((d) => /^sharp@/.test(d));
    if (!dir) throw new Error("sharp not found in node_modules/.pnpm");
    return require(path.join(pnpm, dir, "node_modules/sharp"));
  }
}

const sharp = loadSharp();
const srcDir = path.join(webRoot, "public/avatars");
const outDir = path.join(webRoot, "src/assets/avatars");
mkdirSync(outDir, { recursive: true });

const pngs = readdirSync(srcDir)
  .filter((f) => f.endsWith(".png"))
  .sort();

let total = 0;
for (const file of pngs) {
  const id = file.replace(/\.png$/, "");
  const buf = await sharp(path.join(srcDir, file))
    .resize(256, 256, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 80 })
    .toBuffer();
  writeFileSync(path.join(outDir, `${id}.webp`), buf);
  total += buf.length;
  console.log(`${id}.webp  ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log(`\n${pngs.length} avatars → ${(total / 1024).toFixed(0)} KB total`);
