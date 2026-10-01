/**
 * `pnpm parity:check` — fails when features.yaml and the clients disagree.
 * Run from anywhere in the repo; paths resolve against dodi-app/.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { checkParity, type Manifest } from "./check";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WEB_APP_DIR = "clients/web/src/app";
const MOBILE_APP_DIR = "clients/mobile/src/app";

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const rel = (path: string): string => relative(ROOT, path);

const webRoutes = walk(join(ROOT, WEB_APP_DIR))
  .filter((p) => p.endsWith("/page.tsx"))
  .map(rel);
// Expo Router: every .tsx under app/ is a screen except layouts and the
// special `+` files (+not-found, +html).
const mobileScreens = walk(join(ROOT, MOBILE_APP_DIR))
  .filter((p) => p.endsWith(".tsx"))
  .filter((p) => !/\/_layout\.tsx$|\/\+[^/]+\.tsx$/.test(p))
  .map(rel);
const corePackages = readdirSync(join(ROOT, "core"));

const manifest = parse(readFileSync(join(ROOT, "features.yaml"), "utf8")) as Manifest;
const { errors, warnings } = checkParity(manifest, {
  webRoutes,
  mobileScreens,
  corePackages,
  exists: (path) => existsSync(join(ROOT, path)),
});

for (const warning of warnings) console.warn(`warn  ${warning}`);
for (const error of errors) console.error(`error ${error}`);
const count = manifest.features.length;
if (errors.length) {
  console.error(`\nparity:check failed: ${errors.length} error(s) across ${count} features.`);
  process.exit(1);
}
console.log(`parity:check ok: ${count} features, ${webRoutes.length} web routes, ${mobileScreens.length} mobile screens.`);
