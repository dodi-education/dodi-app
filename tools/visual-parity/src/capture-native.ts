/**
 * The app side: open each screen on a connected Android device or emulator by
 * deep link (`dodi://…` / `dodi-dev://…`, the same paths as the web) and save
 * `screencap`. The app must be installed and, for parent screens, signed in once.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { type ScreenTarget, slugOf } from "./routes";

// The dev client (APP_VARIANT=development) installs as its own app next to the
// store build. Prefer it: it runs the code being compared.
const VARIANTS = [
  { package: "app.dodi.dev", scheme: "dodi-dev" },
  { package: "app.dodi", scheme: "dodi" },
];

function installedVariant(): (typeof VARIANTS)[number] {
  const installed = String(adb(["shell", "pm", "list", "packages", "app.dodi"]))
    .split("\n")
    .map((line) => line.trim());
  const variant = VARIANTS.find((v) => installed.includes(`package:${v.package}`));
  if (!variant) throw new Error("the app is not installed on the device (app.dodi.dev or app.dodi)");
  return variant;
}

function adb(args: string[], encoding: "utf8" | "buffer" = "utf8"): string | Buffer {
  const bin = process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, "platform-tools", "adb") : "adb";
  return execFileSync(bin, args, { encoding: encoding === "utf8" ? "utf8" : undefined, maxBuffer: 64 * 1024 * 1024 });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function captureNative(targets: ScreenTarget[], outDir: string): Promise<void> {
  const devices = String(adb(["devices"]))
    .split("\n")
    .slice(1)
    .filter((line) => /\tdevice$/.test(line));
  if (devices.length === 0) throw new Error("no Android device or emulator connected (adb devices)");
  const variant = installedVariant();
  console.log(`native app ${variant.package}`);
  await mkdir(outDir, { recursive: true });

  for (const target of targets) {
    const url = `${variant.scheme}://${target.route.replace(/^\//, "")}`;
    adb(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, variant.package]);
    await sleep(2500);
    const png = adb(["exec-out", "screencap", "-p"], "buffer") as Buffer;
    await writeFile(join(outDir, `${slugOf(target.route)}.png`), png);
    console.log(`native ${target.route}`);
  }
}
