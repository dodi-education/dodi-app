#!/usr/bin/env node
/**
 * Regenerate the PWA icon set (repeatable).
 *
 *   Source: clients/web/public/images/dodi-head-active.png (335x335 RGBA)
 *   Output: clients/web/public/icons/icon-192.png
 *           clients/web/public/icons/icon-512.png
 *           clients/web/public/icons/icon-maskable-512.png  (safe-zone padded)
 *           clients/web/public/icons/apple-touch-icon.png   (180px, opaque)
 *
 * The mascot head is composited onto the app background color. The maskable
 * variant keeps the head inside the ~80% central safe zone so launcher masks
 * (circle, squircle) never clip it.
 *
 * Run:  node clients/web/scripts/generate-pwa-icons.mjs
 */
import { mkdirSync, readdirSync } from "node:fs";
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

const BACKGROUND = "#F5F8FB"; // --background in globals.css
const source = path.join(webRoot, "public/images/dodi-head-active.png");
const outDir = path.join(webRoot, "public/icons");
mkdirSync(outDir, { recursive: true });

async function renderIcon({ size, headRatio, out }) {
  const headSize = Math.round(size * headRatio);
  const head = await sharp(source)
    .resize(headSize, headSize, { fit: "contain" })
    .toBuffer();
  const offset = Math.round((size - headSize) / 2);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: head, top: offset, left: offset }])
    .png()
    .toFile(path.join(outDir, out));
  console.log(`icons/${out} (${size}px, head ${Math.round(headRatio * 100)}%)`);
}

await renderIcon({ size: 192, headRatio: 0.8, out: "icon-192.png" });
await renderIcon({ size: 512, headRatio: 0.8, out: "icon-512.png" });
await renderIcon({ size: 512, headRatio: 0.6, out: "icon-maskable-512.png" });
await renderIcon({ size: 180, headRatio: 0.75, out: "apple-touch-icon.png" });
