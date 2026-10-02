/**
 * pnpm visual:parity [web|native|report|all]
 *
 *   VISUAL_WEB_URL      web app origin (default https://localhost:3000)
 *   VISUAL_EMAIL / VISUAL_PASSWORD   a test parent account for signed-in screens
 *
 * Output: dodi-app/.visual-parity/{web,native}/*.png and index.html.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import type { Manifest } from "../../parity/src/check";
import { captureNative } from "./capture-native";
import { captureWeb } from "./capture-web";
import { writeReport } from "./report";
import { screenTargets } from "./routes";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const OUT = join(ROOT, ".visual-parity");
const dirs = { web: join(OUT, "web"), native: join(OUT, "native"), out: OUT };

const manifest = parse(readFileSync(join(ROOT, "features.yaml"), "utf8")) as Manifest;
const targets = screenTargets(manifest.features);
const step = process.argv[2] ?? "all";

if (step === "web" || step === "all") {
  await captureWeb(targets, {
    baseUrl: process.env.VISUAL_WEB_URL ?? "https://localhost:3000",
    email: process.env.VISUAL_EMAIL,
    password: process.env.VISUAL_PASSWORD,
    outDir: dirs.web,
  });
}
if (step === "native" || step === "all") {
  try {
    await captureNative(targets, dirs.native);
  } catch (error) {
    console.warn(`skip app captures: ${(error as Error).message}`);
  }
}
if (step === "report" || step === "all") {
  console.log(`report: ${await writeReport(targets, dirs)}`);
}
