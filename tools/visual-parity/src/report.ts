/**
 * Side-by-side report: web | app | difference, one row per screen. The diff
 * runs in the browser (canvas, both images scaled to the same width), so the
 * tool needs no image libraries. Images are inlined so the file opens anywhere.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { type ScreenTarget, slugOf } from "./routes";

async function dataUrl(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
}

export async function writeReport(
  targets: ScreenTarget[],
  dirs: { web: string; native: string; out: string },
): Promise<string> {
  const rows: string[] = [];
  for (const target of targets) {
    const slug = slugOf(target.route);
    const web = await dataUrl(join(dirs.web, `${slug}.png`));
    const app = await dataUrl(join(dirs.native, `${slug}.png`));
    const cell = (src: string | null, label: string) =>
      src ? `<img data-role="${label}" src="${src}">` : `<div class="missing">no ${label} capture</div>`;
    rows.push(`<section data-slug="${slug}">
  <h2>${target.route} <small>${target.featureId}</small> <span class="score"></span></h2>
  <div class="grid">${cell(web, "web")}${cell(app, "app")}<canvas></canvas></div>
</section>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>dodi visual parity</title>
<style>
body{font:14px system-ui;margin:24px;background:#F5F8FB;color:#22384E}
section{margin-bottom:40px}h2{font-size:16px}small{color:#93A5B8;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(3,390px);gap:16px}
img,canvas,.missing{width:390px;border:1px solid #E4EAF1;background:#fff}
.missing{height:200px;display:flex;align-items:center;justify-content:center;color:#93A5B8}
.score{font-weight:400;margin-left:8px}.bad{color:#BF4F44}.ok{color:#2E8B6A}
</style>
<h1>Web vs app (phone layout)</h1>
<p>Left: web at 390×844. Middle: the app. Right: pixels that differ (red), both scaled to 390 px wide. Status bars and fonts differ slightly by nature; look for layout, spacing and color differences.</p>
${rows.join("\n")}
<script>
const load = (img) => img.complete ? Promise.resolve() : new Promise((r) => (img.onload = r));
for (const section of document.querySelectorAll("section")) {
  const web = section.querySelector('[data-role=web]'), app = section.querySelector('[data-role=app]');
  if (!web || !app) continue;
  Promise.all([load(web), load(app)]).then(() => {
    const w = 390, h = Math.round(w * Math.min(web.naturalHeight / web.naturalWidth, app.naturalHeight / app.naturalWidth));
    const draw = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, w, w * img.naturalHeight / img.naturalWidth); return x.getImageData(0, 0, w, h); };
    const a = draw(web), b = draw(app), out = section.querySelector("canvas");
    out.width = w; out.height = h; const ctx = out.getContext("2d"), diff = ctx.createImageData(w, h);
    let differing = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]);
      const hit = d > 60; if (hit) differing++;
      diff.data.set(hit ? [220, 40, 40, 255] : [a.data[i], a.data[i+1], a.data[i+2], 50], i);
    }
    ctx.putImageData(diff, 0, 0);
    const pct = (100 * differing / (w * h)).toFixed(1), score = section.querySelector(".score");
    score.textContent = pct + "% of pixels differ"; score.className = "score " + (pct > 15 ? "bad" : "ok");
  });
}
</script>`;
  const path = join(dirs.out, "index.html");
  await writeFile(path, html);
  return path;
}
