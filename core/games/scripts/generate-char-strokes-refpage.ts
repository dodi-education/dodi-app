/**
 * Regenerates docs/char-strokes-reference.html from the char-strokes dataset —
 * the human-reviewable stroke-order sheet (numbered start points, direction
 * arrows, hover/click animation). Run after any change to
 * core/games/src/char-strokes.ts:
 *
 *   cd core/games && pnpm docs:strokes
 *
 * (Runs through jiti — already a transitive dev dependency — no build step.)
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CHAR_STROKE_COORDS,
  getCharStrokes,
  type CharStrokePoint,
} from "../src/char-strokes.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/char-strokes-reference.html");

const COLORS = ["#0f172a", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#d97706"];
const SECTIONS: Array<[string, string]> = [
  ["DIGITS", "0123456789"],
  ["CAPITALS", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
  ["LOWERCASE", "abcdefghijklmnopqrstuvwxyz"],
  ["GERMAN UMLAUTS &amp; ß", "ÄÖÜäöüß"],
];

const len = (s: CharStrokePoint[]): number =>
  s.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0);

function midArrow(s: CharStrokePoint[], color: string): string {
  if (len(s) < 26 || s.length < 4) return "";
  const i = Math.min(s.length - 2, Math.round(s.length * 0.55));
  const [a, b] = [s[i], s[i + 1]];
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return `<path d="M-1.2,-2.6 L3.8,0 L-1.2,2.6 Z" fill="${color}" opacity="0.95"
    transform="translate(${a[0]},${a[1]}) rotate(${ang})"/>`;
}

function card(ch: string): string {
  const strokes = getCharStrokes(ch);
  if (!strokes) throw new Error(`no stroke data for '${ch}'`);
  const C = CHAR_STROKE_COORDS;
  const refs = [C.capTop, C.xHeightTop, C.baseline, C.descender]
    .map(
      (y) =>
        `<line x1="-2" y1="${y}" x2="102" y2="${y}" stroke="#e2e8f0" stroke-width="0.7" stroke-dasharray="2.5 2.5"/>`,
    )
    .join("");
  const body = strokes
    .map((s, i) => {
      const color = COLORS[i % COLORS.length];
      const pts = s.map((p) => p.join(",")).join(" ");
      const marker = len(s) >= 7 ? `marker-end="url(#arr${i % COLORS.length})"` : "";
      return `<polyline class="stroke" points="${pts}" fill="none" stroke="${color}"
        stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${marker}/>${midArrow(s, color)}`;
    })
    .join("");
  // Strokes often share a start point (A's diagonals, stem+bars of E/B/…) — nudge
  // colliding badges along their own stroke's direction so every number stays visible.
  const placed: CharStrokePoint[] = [];
  const badges = strokes
    .map((s, i) => {
      const color = COLORS[i % COLORS.length];
      let [x, y] = s[0];
      const [nx, ny] = s[1] ?? s[0];
      const d = Math.hypot(nx - s[0][0], ny - s[0][1]) || 1;
      const [ux, uy] = [(nx - s[0][0]) / d, (ny - s[0][1]) / d];
      for (let tries = 0; tries < 4 && placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < 10); tries++) {
        x += ux * 7;
        y += uy * 7;
      }
      placed.push([x, y]);
      return `<g class="badge"><circle cx="${x}" cy="${y}" r="5.6" fill="#fff" stroke="${color}" stroke-width="1.4"/>
        <text x="${x}" y="${y + 2.6}" text-anchor="middle" font-size="7.4" font-weight="700" fill="${color}">${i + 1}</text></g>`;
    })
    .join("");
  return `<figure class="card" tabindex="0">
    <svg viewBox="-6 -8 112 114" aria-label="Stroke order ${ch}">${refs}${body}${badges}</svg>
    <figcaption>${ch}<span>${strokes.length === 1 ? "1 stroke" : `${strokes.length} strokes`}</span></figcaption>
  </figure>`;
}

const markers = COLORS.map(
  (c, i) =>
    `<marker id="arr${i}" viewBox="0 0 8 8" refX="5.6" refY="4" markerWidth="7" markerHeight="7"
       markerUnits="userSpaceOnUse" orient="auto"><path d="M0.8,0.8 L6.8,4 L0.8,7.2 Z" fill="${c}"/></marker>`,
).join("");

const sections = SECTIONS.map(
  ([title, chars]) =>
    `<section><h2>${title}</h2><div class="grid">${[...chars].map(card).join("")}</div></section>`,
).join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stroke order · char-strokes reference</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ui-rounded, "Segoe UI", system-ui, sans-serif; background: #f1f5f9; color: #0f172a; padding: 28px 24px 48px; }
  header { max-width: 1180px; margin: 0 auto 10px; }
  h1 { font-size: 26px; letter-spacing: -0.02em; }
  header p { color: #475569; font-size: 14px; margin-top: 6px; max-width: 72ch; line-height: 1.55; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px 22px; align-items: center; margin: 14px auto 6px; max-width: 1180px;
    background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 16px; font-size: 13px; color: #334155; }
  .legend b { font-weight: 700; }
  .chip { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%;
    border: 2px solid #2563eb; color: #2563eb; font-weight: 700; font-size: 11px; background: #fff; margin-right: 6px; }
  .swatches i { display: inline-block; width: 14px; height: 5px; border-radius: 3px; margin-right: 4px; }
  section { max-width: 1180px; margin: 26px auto 0; }
  h2 { font-size: 15px; letter-spacing: 0.08em; color: #64748b; margin-bottom: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 8px 8px 4px; cursor: pointer;
    transition: box-shadow .15s, transform .15s; }
  .card:hover, .card:focus-visible { box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12); transform: translateY(-2px); outline: none; }
  .card svg { width: 100%; display: block; }
  figcaption { display: flex; justify-content: space-between; align-items: baseline; padding: 2px 6px 4px; font-weight: 700; font-size: 15px; }
  figcaption span { font-weight: 500; font-size: 11px; color: #94a3b8; }
  footer { max-width: 1180px; margin: 34px auto 0; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
<header>
  <h1>Stroke Order — Letters &amp; Numbers</h1>
  <p>How each character is written (German school print convention): the numbered dots show
     where every stroke <b>starts</b> and the <b>order</b> the strokes are drawn in; the arrows
     show the <b>writing direction</b>. Hover or tap a character to play its stroke order.</p>
</header>
<div class="legend">
  <span><span class="chip">1</span><b>Start point</b> &amp; stroke number</span>
  <span>➤ <b>Direction</b> (arrow mid-stroke + at the end)</span>
  <span class="swatches"><b>Order:</b> ${COLORS.map((c, i) => `<i style="background:${c}"></i>${i + 1}`).join(" ")}</span>
  <span>Dashed lines: cap line · x-height · baseline · descender</span>
</div>
<svg width="0" height="0" style="position:absolute"><defs>${markers}</defs></svg>
${sections}
<footer>Generated from <code>core/games/src/char-strokes.ts</code> (${CHAR_STROKE_COORDS.convention}). Regenerate: <code>cd core/games &amp;&amp; pnpm docs:strokes</code></footer>
<script>
  function animate(card) {
    if (card.dataset.busy) return;
    card.dataset.busy = "1";
    const polys = Array.from(card.querySelectorAll("polyline.stroke"));
    let delay = 0, total = 0;
    for (const p of polys) {
      const l = p.getTotalLength();
      p.style.transition = "none";
      p.style.strokeDasharray = l + " " + l;
      p.style.strokeDashoffset = l;
      void p.getBoundingClientRect();
      const dur = Math.max(260, l * 9);
      p.style.transition = "stroke-dashoffset " + dur + "ms ease-in-out " + delay + "ms";
      p.style.strokeDashoffset = "0";
      delay += dur + 140;
      total = delay;
    }
    setTimeout(() => {
      for (const p of polys) { p.style.transition = "none"; p.style.strokeDasharray = "none"; }
      delete card.dataset.busy;
    }, total + 250);
  }
  for (const card of document.querySelectorAll(".card")) {
    card.addEventListener("mouseenter", () => animate(card));
    card.addEventListener("click", () => animate(card));
  }
</script>
</body>
</html>`;

writeFileSync(OUT, html);
console.log(`wrote ${OUT}`);
