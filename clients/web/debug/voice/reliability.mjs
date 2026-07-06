#!/usr/bin/env node
/**
 * Tool-call RELIABILITY experiment: does promoting `generate_drawing` to a
 * first-class voice tool make the native-audio model actually emit the draw call
 * more often than routing it through the umbrella `execute_game_command`?
 *
 * For each trial we ask ONCE (`--max-nudges=0`) so we measure *first-ask*
 * reliability — the real-world failure is "dodi says it will draw but never
 * calls the tool", which nudging would paper over. The two tool shapes see the
 * SAME prompt on the same trial index (paired design), so phrasing is controlled.
 *
 * Usage: node reliability.mjs [trials] [shape1 shape2 ...]
 *   e.g. node reliability.mjs 8 generic first-class
 *
 * Reads GEMINI_API_KEY from the env (use ./run.sh's key.env, or export it):
 *   set -a; . ./key.env; set +a; node reliability.mjs 8
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const trials = Number(process.argv[2] || 8);
const shapes = process.argv.slice(3).length ? process.argv.slice(3) : ["generic", "first-class"];

if (!process.env.GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY. Run:  set -a; . ./key.env; set +a; node reliability.mjs");
  process.exit(2);
}

// Varied, natural draw requests. Trial i uses PROMPTS[(i-1) % len] for BOTH
// shapes, so the comparison is paired on phrasing.
const PROMPTS = [
  { text: "Hey dodi, can you draw a dog for me to color in?", subject: "dog" },
  { text: "dodi, I want to color an owl. Can you make one?", subject: "owl" },
  { text: "Can you draw me a butterfly please?", subject: "butterfly" },
  { text: "I love cats! Draw a cat for me.", subject: "cat" },
  { text: "Make me a picture of a rocket ship.", subject: "rocket" },
  { text: "Draw a flower I can color.", subject: "flower" },
];

function runTrial(shape, i, prompt) {
  const out = join(here, "batch", `rel-${shape}-${i}`);
  mkdirSync(out, { recursive: true });
  spawnSync(
    "node",
    [
      "harness.mjs",
      `--tools=${shape}`,
      "--mode=immediate",
      "--gen-ms=600",
      "--max-nudges=0",
      `--prompt=${prompt.text}`,
      `--out=${out}`,
    ],
    { cwd: here, encoding: "utf8", timeout: 90000 },
  );
  const sPath = join(out, "summary.json");
  if (!existsSync(sPath)) return { ok: false, drew: false };
  const s = JSON.parse(readFileSync(sPath, "utf8"));
  const subjectOk =
    s.drewPicture &&
    typeof s.drawSubject === "string" &&
    s.drawSubject.toLowerCase().includes(prompt.subject);
  return {
    ok: true,
    drew: !!s.drewPicture,
    firstAsk: !!s.drewOnFirstAsk,
    tool: s.drawToolName,
    subject: s.drawSubject,
    subjectOk,
  };
}

const results = {};
for (const shape of shapes) results[shape] = [];

for (let i = 1; i <= trials; i++) {
  const prompt = PROMPTS[(i - 1) % PROMPTS.length];
  for (const shape of shapes) {
    process.stdout.write(`trial ${i}/${trials}  ${shape.padEnd(11)} "${prompt.subject}" ... `);
    const r = runTrial(shape, i, prompt);
    results[shape].push({ i, prompt, ...r });
    console.log(
      r.drew
        ? `drew✓ via ${r.tool} subject=${JSON.stringify(r.subject)}${r.subjectOk ? "" : " (subject≠asked)"}`
        : r.ok ? "drew✗ (no tool call)" : "NO SUMMARY (crash/timeout)",
    );
  }
}

const pct = (n, d) => (d ? ((100 * n) / d).toFixed(0) : "0") + "%";

console.log("\n===================== RELIABILITY (first-ask, N=" + trials + "/shape) =====================");
console.log("drewOnFirstAsk = model emitted the draw tool call on the very first request (no nudges).\n");
const summary = [];
for (const shape of shapes) {
  const rs = results[shape];
  const drew = rs.filter((r) => r.drew).length;
  const subjOk = rs.filter((r) => r.subjectOk).length;
  summary.push({ shape, drew, subjOk, total: rs.length });
  console.log(
    `${shape.padEnd(12)}  drew ${drew}/${rs.length} (${pct(drew, rs.length)})   ` +
    `correct-subject ${subjOk}/${rs.length} (${pct(subjOk, rs.length)})`,
  );
  const misses = rs.filter((r) => !r.drew).map((r) => `#${r.i}:${r.prompt.subject}`);
  if (misses.length) console.log(`   misses: ${misses.join(", ")}`);
}

if (summary.length === 2) {
  const [a, b] = summary;
  const delta = pct(b.drew, b.total).replace("%", "") - pct(a.drew, a.total).replace("%", "");
  console.log(
    `\nΔ draw-rate (${b.shape} − ${a.shape}) = ${delta >= 0 ? "+" : ""}${delta} pts` +
    (delta > 0 ? "  → first-class more reliable" : delta < 0 ? "  → generic more reliable" : "  → no difference"),
  );
  console.log("Note: native-audio Live is non-deterministic; use N>=8 and read the trend, not a single run.");
}
console.log("============================================================================");
