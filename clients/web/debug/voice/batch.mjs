#!/usr/bin/env node
/**
 * Runs the harness N times per mode and prints a compact comparison table.
 * The native-audio model is non-deterministic (it doesn't always emit the tool
 * call), so we aggregate several trials per mode and focus on the PHASE buckets
 * (preamble / pending-window / post) which are the decision-relevant numbers.
 *
 * Usage: node batch.mjs [trials] [mode1 mode2 ...]
 *   e.g. node batch.mjs 4 immediate prompt-suppress defer
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const trials = Number(process.argv[2] || 4);
const modes = process.argv.slice(3).length ? process.argv.slice(3) : ["immediate", "prompt-suppress", "defer"];

const rows = [];
for (const mode of modes) {
  for (let i = 1; i <= trials; i++) {
    const out = join(here, "batch", `${mode}-${i}`);
    mkdirSync(out, { recursive: true });
    process.stdout.write(`running ${mode} trial ${i}/${trials} ... `);
    spawnSync("node", ["harness.mjs", `--mode=${mode}`, `--out=${out}`], { cwd: here, encoding: "utf8", timeout: 95000 });
    const sPath = join(out, "summary.json");
    if (!existsSync(sPath)) {
      console.log("NO SUMMARY (crash/timeout)");
      rows.push({ mode, i, ok: false });
      continue;
    }
    const s = JSON.parse(readFileSync(sPath, "utf8"));
    const row = {
      mode, i, calledTool: s.calledTool,
      window: s.phases.window.audioSec, windowChunks: s.phases.window.chunks,
      post: s.phases.post.audioSec, preamble: s.phases.preamble.audioSec,
      repeat: s.toolTurnRepetition?.mostRepeated?.count ?? 0,
      repeatText: s.toolTurnRepetition?.mostRepeated?.text ?? "",
    };
    rows.push(row);
    console.log(
      s.calledTool
        ? `tool✓ window=${row.window}s(${row.windowChunks}) post=${row.post}s preamble=${row.preamble}s maxRepeat=${row.repeat}x`
        : "tool✗ (no generate_drawing call)",
    );
  }
}

console.log("\n===================== AGGREGATE (tool-call trials only) =====================");
console.log("The 'pending-window' column is the money metric: audio the child hears WHILE");
console.log("the drawing generates. Lower = quieter during generation.\n");
for (const mode of modes) {
  const mr = rows.filter((r) => r.mode === mode && r.calledTool);
  const total = rows.filter((r) => r.mode === mode).length;
  if (!mr.length) { console.log(`${mode}: 0/${total} trials produced a tool call — no data`); continue; }
  const avg = (f) => (mr.reduce((a, r) => a + f(r), 0) / mr.length).toFixed(1);
  const max = (f) => Math.max(...mr.map(f));
  console.log(
    `${mode}: toolCalls=${mr.length}/${total} | ` +
    `avg pending-window=${avg((r) => r.window)}s (worst ${max((r) => r.window).toFixed(1)}s) | ` +
    `avg post=${avg((r) => r.post)}s | avg maxRepeat=${avg((r) => r.repeat)}x (worst ${max((r) => r.repeat)}x)`,
  );
  for (const r of mr) console.log(`   ${mode}-${r.i}: window=${r.window}s post=${r.post}s repeat=${r.repeat}x  "${r.repeatText.slice(0, 50)}"`);
}
console.log("============================================================================");
