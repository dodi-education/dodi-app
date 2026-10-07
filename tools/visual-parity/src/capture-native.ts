/**
 * The app side: open each screen on a connected Android device or emulator by
 * deep link (`dodi://…`, the same paths as the web) and save `screencap`.
 * The app must be installed and, for parent screens, signed in once.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { type ScreenTarget, slugOf } from "./routes";

const PACKAGE = "app.dodi";

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
  await mkdir(outDir, { recursive: true });

  for (const target of targets) {
    adb(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `dodi://${target.route.replace(/^\//, "")}`, PACKAGE]);
    await sleep(2500);
    const png = adb(["exec-out", "screencap", "-p"], "buffer") as Buffer;
    await writeFile(join(outDir, `${slugOf(target.route)}.png`), png);
    console.log(`native ${target.route}`);
  }
}
