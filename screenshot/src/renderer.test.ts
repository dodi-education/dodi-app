import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRenderer, RenderBusyError, RenderTimeoutError, type Renderer } from "./renderer";

/**
 * Integration tests against a real Chromium. They skip themselves (with a
 * note) when no browser is installed: `pnpm --filter @dodi/screenshot browsers`.
 */

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'";

/** A compliant game: fills the canvas, answers dodi:init, reacts to submit_answer. */
const GAME = `<!doctype html><html><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<style>html,body{margin:0;height:100%}#root{width:100%;height:100%;background:linear-gradient(#ffd66e,#f5a623);font:700 40px sans-serif;display:flex;align-items:center;justify-content:center}</style>
</head><body><div id="root">Hello</div><script>
var token = null;
window.addEventListener('message', function (e) {
  var d = e.data; if (!d || !d.type) return;
  if (d.type === 'dodi:init') {
    token = d.token;
    parent.postMessage({ type: 'game:ready', token: token, payload: { capabilities: ['submit_answer'] } }, '*');
  }
  if (d.type === 'dodi:command') {
    var c = d.payload.command;
    if (c.type === 'submit_answer') {
      var root = document.getElementById('root');
      root.style.background = '#2a9d4f'; root.textContent = 'Correct';
      parent.postMessage({ type: 'game:result', token: token, payload: { command: c, result: { ok: true } } }, '*');
    }
  }
});
</script></body></html>`;

/** Throws on load, logs an error, never answers dodi:init. */
const CRASHING_GAME = `<!doctype html><html><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${CSP}" /></head><body><script>
console.error('bad thing happened');
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'dodi:init') parent.postMessage({ type: 'game:error', token: e.data.token, payload: { error: 'nope' } }, '*');
});
throw new Error('boom on load');
</script></body></html>`;

/** Never answers at all. */
const SILENT_GAME = `<!doctype html><html><body></body></html>`;

function jpegBytes(dataUrl: string): Buffer {
  expect(dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  const buf = Buffer.from(dataUrl.slice("data:image/jpeg;base64,".length), "base64");
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  return buf;
}

/** Width/height from the JPEG's SOF marker. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("no SOF marker");
}

let available = false;
let renderer: Renderer;

beforeAll(async () => {
  try {
    const browser = await chromium.launch({ headless: true, chromiumSandbox: false });
    await browser.close();
    available = true;
  } catch {
    console.warn("[screenshot] Chromium not installed; skipping renderer tests (pnpm --filter @dodi/screenshot browsers)");
  }
  renderer = createRenderer({
    maxConcurrent: 1,
    renderTimeoutMs: 15_000,
    readyTimeoutMs: 2_000,
    chromiumSandbox: false,
  });
});

afterAll(async () => {
  await renderer?.close();
});

describe("renderer", () => {
  it("renders a compliant game: opening frame plus one per step, real JPEGs at the viewport", async (ctx) => {
    if (!available) return ctx.skip();
    const result = await renderer.render({
      version: 1,
      document: GAME,
      viewport: { width: 400, height: 500 },
      settleMs: 100,
      steps: [
        { label: "after answer", command: { type: "submit_answer", payload: { answer: "3" } }, waitMs: 500 },
        { label: "after unknown", command: { type: "give_hint" }, waitMs: 200 },
      ],
    });
    expect(result.ready).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.frames.map((f) => f.label)).toEqual(["initial", "after answer", "after unknown"]);
    const initial = jpegBytes(result.frames[0].image);
    const answered = jpegBytes(result.frames[1].image);
    expect(jpegSize(initial)).toEqual({ width: 400, height: 500 });
    // The game changed color and text on submit_answer, so the frames differ.
    expect(initial.equals(answered)).toBe(false);
    // give_hint is not implemented by the fixture: no game:result, so a warning.
    expect(result.warnings).toEqual(["step 2 (after unknown): no game:result within 200ms"]);
  });

  it("reports a crash on load: not ready, errors captured, steps skipped", async (ctx) => {
    if (!available) return ctx.skip();
    const result = await renderer.render({
      version: 1,
      document: CRASHING_GAME,
      settleMs: 50,
      steps: [{ label: "never", command: { type: "submit_answer" } }],
    });
    expect(result.ready).toBe(false);
    expect(result.frames.map((f) => f.label)).toEqual(["initial"]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bad thing happened"),
        expect.stringContaining("boom on load"),
        "game:error: nope",
      ]),
    );
    expect(result.warnings).toEqual(["skipped 1 step(s): the game never became ready"]);
    // Default viewport is the 4:5 stage.
    expect(jpegSize(jpegBytes(result.frames[0].image))).toEqual({ width: 576, height: 720 });
  });

  it("enforces the render deadline and still cleans up", async (ctx) => {
    if (!available) return ctx.skip();
    const slow = createRenderer({
      maxConcurrent: 1,
      renderTimeoutMs: 400,
      readyTimeoutMs: 10_000,
      chromiumSandbox: false,
    });
    try {
      await expect(slow.render({ version: 1, document: SILENT_GAME })).rejects.toBeInstanceOf(RenderTimeoutError);
      // The slot was released: a second render on the same instance works.
      const ok = await slow.render({ version: 1, document: GAME, settleMs: 50 }).catch((e) => e);
      expect(ok).not.toBeInstanceOf(RenderBusyError);
    } finally {
      await slow.close();
    }
  });

  it("answers busy once the queue is full", async (ctx) => {
    if (!available) return ctx.skip();
    const tiny = createRenderer({
      maxConcurrent: 1,
      renderTimeoutMs: 15_000,
      readyTimeoutMs: 2_000,
      chromiumSandbox: false,
    });
    try {
      // 1 in flight + 2 queued fit; the 4th must be refused immediately.
      const runs = Array.from({ length: 4 }, () =>
        tiny.render({ version: 1, document: GAME, settleMs: 300 }).then(
          () => "ok",
          (e: unknown) => (e instanceof RenderBusyError ? "busy" : "error"),
        ),
      );
      const outcomes = await Promise.all(runs);
      expect(outcomes.filter((o) => o === "busy")).toHaveLength(1);
      expect(outcomes.filter((o) => o === "ok")).toHaveLength(3);
    } finally {
      await tiny.close();
    }
  });
});
