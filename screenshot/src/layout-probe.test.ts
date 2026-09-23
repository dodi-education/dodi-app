import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { collectLayoutIssues, type ProbedOverlap } from "./layout-probe";
import { createRenderer, type Renderer } from "./renderer";

/**
 * The measured layout check against a real Chromium (skips without one, like
 * renderer.test.ts). The first case is the reported bug: a clock pushed up
 * into the progress bar above it.
 */

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'";

function game(body: string, css: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<style>html,body{margin:0;height:100%}body{position:relative;background:linear-gradient(#bde,#9cd);font:700 18px sans-serif}${css}</style>
</head><body>${body}<script>
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'dodi:init') parent.postMessage({ type: 'game:ready', token: e.data.token, payload: { capabilities: [] } }, '*');
});
</script></body></html>`;
}

const HUD_CSS = `
.prompt{position:absolute;left:48px;right:48px;top:60px;height:44px;background:#fff;border-radius:16px;display:flex;align-items:center;justify-content:center}
.progress{position:absolute;left:112px;right:112px;top:120px;height:10px;background:#eee;border:2px solid #ccc;border-radius:6px}
.progress-fill{width:25%;height:100%;background:#8c4}`;

const CLOCK_OVER_PROGRESS = game(
  `<div class="prompt">Ziehe die Zeiger</div>
   <div class="progress"><div class="progress-fill"></div></div>
   <div class="clock" style="position:absolute;left:160px;top:110px;width:260px;height:260px;border-radius:50%;background:#fff;border:12px solid #c9a24a">
     <span style="position:absolute;left:115px;top:8px">12</span>
   </div>`,
  HUD_CSS,
);

const CLEAN_LAYOUT = game(
  `<div class="prompt">Ziehe die Zeiger</div>
   <div class="progress"><div class="progress-fill"></div></div>
   <div class="card" style="position:absolute;left:160px;top:180px;width:260px;height:260px;border-radius:24px;background:#fff">
     <span style="position:absolute;left:100px;top:8px">12</span>
   </div>
   <div class="label" style="position:absolute;left:190px;top:400px;padding:4px 8px;background:#fd6">on the card</div>`,
  HUD_CSS,
);

const INTENDED_OVERLAP = game(
  `<div class="card" style="position:absolute;left:160px;top:180px;width:260px;height:260px;background:#fff"></div>
   <div class="badge" data-overlap-ok style="position:absolute;left:390px;top:160px;width:60px;height:60px;border-radius:50%;background:#fc3"></div>`,
  "",
);

let available = false;
let renderer: Renderer;

beforeAll(async () => {
  try {
    const browser = await chromium.launch({ headless: true, chromiumSandbox: false });
    await browser.close();
    available = true;
  } catch {
    console.warn("[screenshot] Chromium not installed; skipping layout probe tests");
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

describe("measured layout check", () => {
  it("reports a clock covering the progress bar, once, as the outermost pair", async (ctx) => {
    if (!available) return ctx.skip();
    const result = await renderer.render({ version: 1, document: CLOCK_OVER_PROGRESS, settleMs: 0 });
    expect(result.layoutIssues).toHaveLength(1);
    expect(result.layoutIssues?.[0]).toMatch(/^div\.clock "12" covers div\.progress \(.+ px at .+\), frame 1 \(initial\)$/);
  });

  it("stays quiet for a clean layout and for a label layered fully on a card", async (ctx) => {
    if (!available) return ctx.skip();
    const result = await renderer.render({ version: 1, document: CLEAN_LAYOUT, settleMs: 0 });
    expect(result.layoutIssues).toBeUndefined();
  });

  it("respects data-overlap-ok for an intended overlap", async (ctx) => {
    if (!available) return ctx.skip();
    const result = await renderer.render({ version: 1, document: INTENDED_OVERLAP, settleMs: 0 });
    expect(result.layoutIssues).toBeUndefined();
  });
});

describe("collectLayoutIssues", () => {
  const overlap = (a: string, b: string, top: ProbedOverlap["top"]): ProbedOverlap => ({
    a: { name: a, path: `P/${a}` },
    b: { name: b, path: `P/${b}` },
    top,
    x: 10,
    y: 20,
    width: 30,
    height: 4,
  });

  it("merges the same pair across frames and names who is on top", () => {
    const lines = collectLayoutIssues(
      [[overlap("div.clock", "div.bar", "a")], [overlap("div.bar", "div.clock", "b")], []],
      ["initial", "after answer", "end"],
    );
    expect(lines).toEqual([
      "div.clock covers div.bar (30×4 px at 10,20), frames 1 (initial), 2 (after answer)",
    ]);
  });

  it("says overlaps when neither element is on top", () => {
    expect(collectLayoutIssues([[overlap("a", "b", null)]], ["initial"])).toEqual([
      "a overlaps b (30×4 px at 10,20), frame 1 (initial)",
    ]);
  });
});
