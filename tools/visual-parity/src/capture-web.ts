/**
 * The web side: render each screen in headless Chromium at a phone viewport
 * (390×844, the web's `compact` layout) and save a PNG. Signed-in screens use
 * a test account, signed in once through the real login form.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

import { type ScreenTarget, slugOf } from "./routes";

export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;

export interface WebCaptureOptions {
  baseUrl: string;
  email?: string;
  password?: string;
  outDir: string;
}

export async function captureWeb(targets: ScreenTarget[], opts: WebCaptureOptions): Promise<void> {
  await mkdir(opts.outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: PHONE_VIEWPORT,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true, // the dev server's mkcert certificate
    });
    const page = await context.newPage();

    const signedOut = targets.filter((t) => !t.isSignedIn);
    const signedIn = targets.filter((t) => t.isSignedIn);

    for (const target of signedOut) await shoot(page, opts, target);

    if (signedIn.length) {
      if (!opts.email || !opts.password) {
        console.warn("skip signed-in screens: set VISUAL_EMAIL and VISUAL_PASSWORD");
      } else {
        await page.goto(`${opts.baseUrl}/login`);
        await page.getByLabel(/e-?mail/i).fill(opts.email);
        await page.locator('input[type="password"]').first().fill(opts.password);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(/\/parent\//, { timeout: 60_000 });
        for (const target of signedIn) await shoot(page, opts, target);
      }
    }
  } finally {
    await browser.close();
  }
}

async function shoot(
  page: import("playwright").Page,
  opts: WebCaptureOptions,
  target: ScreenTarget,
): Promise<void> {
  await page.goto(`${opts.baseUrl}${target.route}`, { waitUntil: "networkidle" });
  // Fonts and the vault unlock settle after the network does.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(opts.outDir, `${slugOf(target.route)}.png`) });
  console.log(`web    ${target.route}`);
}
