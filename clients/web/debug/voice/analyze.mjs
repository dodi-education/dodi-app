#!/usr/bin/env node
/**
 * Prints a per-second transcript+event timeline for one or more run dirs, so you
 * can see exactly WHEN the model speaks relative to the tool call and our sends.
 *
 * Usage: node analyze.mjs run-immediate batch/defer-2 ...
 */
import { readFileSync } from "node:fs";

for (const dir of process.argv.slice(2)) {
  let ev;
  try {
    ev = readFileSync(`${dir}/events.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  } catch {
    console.log(`\n=== ${dir} === (no events.jsonl)`);
    continue;
  }
  console.log(`\n=== ${dir} ===`);
  const perSec = {};
  for (const e of ev) {
    if (e.type === "audio") { const s = Math.floor(e.t / 1000); perSec[s] = (perSec[s] || 0) + 1; continue; }
    if (e.type === "outputTranscription") console.log(`${String(e.t).padStart(6)}ms  TXT  ${JSON.stringify(e.text)}`);
    else if (e.type === "toolCall") console.log(`${String(e.t).padStart(6)}ms  >>> TOOLCALL ${e.name} ${JSON.stringify(e.args)}`);
    else if (e.dir === "out" && (e.type === "toolResponse" || e.type === "sendContext" || e.type.startsWith("clientContent"))) console.log(`${String(e.t).padStart(6)}ms  OUT  ${e.type}`);
    else if (e.type === "interrupted") console.log(`${String(e.t).padStart(6)}ms  *** INTERRUPTED`);
    else if (e.type === "turnComplete") console.log(`${String(e.t).padStart(6)}ms  --- turnComplete`);
  }
  console.log("audio chunks/sec:", JSON.stringify(perSec));
}
