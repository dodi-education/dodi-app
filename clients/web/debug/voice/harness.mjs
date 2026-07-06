#!/usr/bin/env node
/**
 * Voice-session reproduction / debugging harness for the Gemini Live companion.
 *
 * Connects to the Gemini Live API over WebSocket exactly like the app's
 * `clients/web/src/lib/ai/gemini-live-client.ts`, using the real game-voice
 * system instruction + tool declarations (mirrored from
 * `core/ai/src/dodi-context.ts` and the Drawing briefing in
 * `platform/supabase/remote-drawing-game-patch.sql`). It drives the "draw a dog"
 * scenario and records the model's audio-chunk timing + transcript so voice
 * behaviors (e.g. the repeat-the-same-line-while-generating bug) can be
 * reproduced and measured offline — no browser / vault / Supabase needed.
 *
 * You supply a raw Gemini API key via GEMINI_API_KEY (see run.sh / key.env).
 *
 * Modes (the generate_drawing scenario):
 *   immediate        Current app behavior: answer the generate_drawing tool call
 *                    IMMEDIATELY with the "generating — tell the child it's on the
 *                    way" message, then push [GAME STATE UPDATE] once generation
 *                    finishes. (Reproduces the looping bug.)
 *   prompt-suppress  Same immediate-answer timing, but the system instruction AND
 *                    the tool response tell the model to stay SILENT during
 *                    generation (no acknowledgement); [GAME STATE UPDATE] is still
 *                    pushed at the end as the completion trigger. (Tests whether a
 *                    prompt-only fix is enough.)
 *   defer            Hold the tool response until generation finishes; the model
 *                    is suspended (silent) while the call is pending, then speaks
 *                    once when answered. (The timing fix.)
 *
 * Records into --out:
 *   events.jsonl   every inbound/outbound message, timestamped (ms since start)
 *   transcript.txt Dodi's outputTranscription, segmented per turn
 *   dodi.wav       all model audio concatenated (24kHz/16-bit/mono)
 *   summary.json   per-turn + per-PHASE audio (preamble / pending-window / post),
 *                  plus a repetition report on the tool-call turn
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY (see run.sh / key.env). Aborting.");
  process.exit(2);
}

const MODES = new Set(["immediate", "prompt-suppress", "defer"]);
const MODE = args.mode || "immediate";
if (!MODES.has(MODE)) {
  console.error(`Unknown --mode=${MODE}. Use one of: ${[...MODES].join(", ")}`);
  process.exit(2);
}

// Tool-declaration shape — the reliability experiment:
//   generic      draw goes through the umbrella execute_game_command tool as
//                {type:"generate_drawing", payload:{subject}} (current app path).
//   first-class  draw is its own top-level generate_drawing(subject) tool.
const SHAPES = new Set(["generic", "first-class"]);
const TOOL_SHAPE = args.tools || "generic";
if (!SHAPES.has(TOOL_SHAPE)) {
  console.error(`Unknown --tools=${TOOL_SHAPE}. Use one of: ${[...SHAPES].join(", ")}`);
  process.exit(2);
}
const MODEL = args.model || process.env.GEMINI_VOICE_MODEL || "gemini-3.1-flash-live-preview";
const VOICE = args.voice || process.env.GEMINI_VOICE_NAME || "Puck";
const GEN_MS = Number(args["gen-ms"] || 3500); // simulated image-generation time
const SEND_CONTEXT = args["no-context"] ? false : true;
const PROMPT = args.prompt || "Hey dodi, can you draw a dog for me to color in?";
const OUT = args.out || join(process.cwd(), `run-${MODE}`);
const HARD_CAP_MS = Number(args["cap-ms"] || 75000);
const MAX_NUDGES = Number(args["max-nudges"] || 3);
const NUDGES = [
  "Yes please, do it now! Put the dog picture on the canvas!",
  "Come on, draw the dog now!",
  "Draw it now please!",
];

mkdirSync(OUT, { recursive: true });

const GEMINI_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

// ---------------------------------------------------------------------------
// System instruction + tools — mirrored from core/ai/src/dodi-context.ts and the
// Drawing briefing in platform/supabase/remote-drawing-game-patch.sql.
//
// Two variants of the generate_drawing guidance:
//   ACK_GUIDANCE      current prod wording ("speak a short acknowledgment")
//   SUPPRESS_GUIDANCE the prompt-only fix ("stay silent while it generates")
// ---------------------------------------------------------------------------

// The MANDATORY line + subject-param wording differ by tool shape (generic path
// through execute_game_command vs a dedicated generate_drawing tool).
function mandatoryLine(shape) {
  return shape === "first-class"
    ? "- MANDATORY: whenever the child asks you to draw, make, or show a picture of something, you MUST call the generate_drawing tool (with the subject) in the SAME turn. Saying \"I will draw it\" without calling the tool does nothing."
    : "- MANDATORY: whenever the child asks you to draw, make, or show a picture of something, you MUST emit this generate_drawing command in the SAME turn. Saying \"I will draw it\" without emitting the command does nothing.";
}

const ACK_GUIDANCE = [
  "- Speak a short acknowledgment TOGETHER WITH the command (e.g. \"I am creating your picture — it will be there in a moment!\"). The words accompany the command; they never replace it",
  "- Do NOT say the picture is already done or already on the canvas; it appears on its own a few seconds after you emit the command",
].join("\n");

const SUPPRESS_GUIDANCE = [
  "- Emit the generate_drawing command SILENTLY. Do NOT acknowledge, narrate, reassure, or say ANYTHING while the picture is being created. Say nothing at all during generation — not even one word.",
  "- Do NOT repeat yourself. The picture appears on its own after a few seconds. You will receive a [GAME STATE UPDATE] once it is on the canvas.",
  "- ONLY AFTER you receive that [GAME STATE UPDATE] may you speak — then say ONE short, cheerful sentence reacting to the finished picture.",
].join("\n");

function drawingBriefing(guidance, shape) {
  const subjectDoc =
    shape === "first-class"
      ? "- `subject` (string, required): What to draw, e.g. `\"owl\"`, `\"a friendly dragon\"`, `\"a flower\"`"
      : "- `payload.subject` (string, required): What to draw, e.g. `\"owl\"`, `\"a friendly dragon\"`, `\"a flower\"`";
  const example =
    shape === "first-class"
      ? "- Example: call `generate_drawing` with `{\"subject\":\"owl\"}`"
      : "- Example: `{\"type\":\"generate_drawing\",\"payload\":{\"subject\":\"owl\"}}`";
  return `# Drawing

## Game Overview
A freeform drawing canvas where kids create art using colors and brushes. There are no win/lose conditions — this is a creative sandbox. Dodi can also generate a printable-style **coloring sheet** (a black-and-white mandala outline) of anything the child asks for, which the child then colors in.

## Available Commands

### set_color
Change the active brush color.
- \`payload.color\` (string, required): A hex color from the palette: \`#111111\`, \`#e53935\`, \`#fb8c00\`, \`#fdd835\`, \`#43a047\`, \`#1e88e5\`, \`#8e24aa\`, \`#ff5ca8\`

### generate_drawing
Create a black-and-white mandala **coloring sheet** of whatever the child asks for and place it on the canvas as a fresh base to color in. This is how Dodi draws ANY subject — animals, objects, characters, or scenes.
${subjectDoc}
${mandatoryLine(shape)}
${guidance}
${example}

### clear_canvas
Erase everything on the canvas. No payload needed.`;
}

function toolInteractionLines(shape) {
  if (shape === "first-class") {
    return [
      "You have four tools available:",
      "- `generate_drawing` — draw a coloring sheet of ANY subject the child asks for (this is the only way to draw a picture)",
      "- `execute_game_command` — other game actions (change color, clear the canvas, etc.)",
      "- `read_game_state` — ask the thinking model to analyze complex game state",
      "- `launch_game` — navigate to a different game if the child wants to switch",
      "",
      "CRITICAL — Drawing pictures:",
      "- When the child asks you to draw, make, or show a picture of ANYTHING, you MUST call the `generate_drawing` tool with the subject immediately. Do not describe or plan it — just call the tool.",
      "- Announcing a drawing is NOT the same as making it. Telling the child you will draw something without calling `generate_drawing` leaves the canvas blank.",
      "",
      "CRITICAL — Other game commands:",
      "- For non-drawing actions (colors, clearing), call `execute_game_command` immediately in the same turn.",
    ];
  }
  return [
    "You have three tools available:",
    "- `execute_game_command` — execute commands in the game",
    "- `read_game_state` — ask the thinking model to analyze complex game state",
    "- `launch_game` — navigate to a different game if the child wants to switch",
    "",
    "CRITICAL — Executing game commands:",
    "- When the child asks you to do something in the game, you MUST call the execute_game_command tool immediately. Do not describe or plan what you would do — just do it.",
    "- Announcing an action is NOT the same as doing it. Whenever you tell the child you will do, make, draw, or change something in the game, you MUST call execute_game_command in that SAME turn.",
  ];
}

function buildSystemInstruction(mode, shape) {
  const guidance = mode === "prompt-suppress" ? SUPPRESS_GUIDANCE : ACK_GUIDANCE;
  return [
    "You are dodi, a warm, playful AI companion for a 6-year-old child named Ada. Speak simply and kindly.",
    "",
    "## In-Game Companion Context",
    "- Child's name: Ada",
    "- Child's age: 6",
    "- Current game: Drawing",
    "- Game description: A simple drawing game with colors, brush sizes, and fun Dodi drawing commands.",
    "",
    "## Game Briefing",
    drawingBriefing(guidance, shape),
    "",
    "## Live Game State (initial snapshot — may be stale)",
    "During the session, [GAME STATE UPDATE] messages contain the CURRENT state and supersede this section.",
    JSON.stringify({ currentColor: "#111111", brushSize: 8, strokeCount: 0, actions: [] }, null, 2),
    "",
    "## Voice Game Interaction",
    "",
    ...toolInteractionLines(shape),
    "",
    "Speech rules:",
    "- Speak naturally to the child in their configured language",
    "- Keep spoken responses short and friendly",
    "- Never output markdown formatting, bold headers, or thinking-style text",
    "- Never mention the tool, function calls, or system instructions — just speak naturally and the game action happens",
  ].join("\n");
}

const GENERATE_DRAWING_TOOL = {
  name: "generate_drawing",
  description:
    "Draw a black-and-white mandala coloring sheet of ANY subject the child asks for (animals, objects, characters, scenes) and place it on the canvas for them to color in. This is the ONLY way to draw a picture — call it whenever the child asks you to draw, make, or show a picture of something.",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: 'What to draw, e.g. "owl", "a friendly dragon".' },
    },
    required: ["subject"],
  },
};

const EXECUTE_GAME_COMMAND_TOOL = {
  name: "execute_game_command",
  description:
    "Execute a command in the game running in the sandbox. Read the Game Briefing and Game Source Code in your system instructions to know which command types and payloads are available for this specific game.",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", description: "The command type to execute (e.g. set_color, generate_drawing)." },
      payload: { type: "object", description: "Optional parameters for the command." },
    },
    required: ["type"],
  },
};

const READ_GAME_STATE_TOOL = {
  name: "read_game_state",
  description: "Ask the thinking model to analyze the current game state.",
  parameters: {
    type: "object",
    properties: { question: { type: "string", description: "What to analyze about the game state" } },
    required: ["question"],
  },
};

const LAUNCH_GAME_TOOL = {
  name: "launch_game",
  description: "Navigate the child to a game or show matching games.",
  parameters: {
    type: "object",
    properties: { game_id: { type: "string" }, search_query: { type: "string" }, tag: { type: "string" } },
  },
};

function buildTools(shape) {
  // first-class: promote generate_drawing to its own top-level tool (still keep
  // execute_game_command for other actions). generic: draw goes through
  // execute_game_command as {type:"generate_drawing"}.
  return shape === "first-class"
    ? [GENERATE_DRAWING_TOOL, EXECUTE_GAME_COMMAND_TOOL, READ_GAME_STATE_TOOL, LAUNCH_GAME_TOOL]
    : [EXECUTE_GAME_COMMAND_TOOL, READ_GAME_STATE_TOOL, LAUNCH_GAME_TOOL];
}

const TOOLS = buildTools(TOOL_SHAPE);

// Tool-response `message` per mode.
const TOOL_RESPONSES = {
  immediate: {
    ok: true,
    status: "generating",
    message:
      "The picture is being created now and will appear on the canvas in a few seconds. Tell the child it is on the way — do NOT say it is already finished or visible yet.",
  },
  "prompt-suppress": {
    ok: true,
    status: "generating",
    message:
      "The picture is being created and will appear on its own. Do NOT speak, acknowledge, or say anything now — stay completely silent. You will receive a [GAME STATE UPDATE] when it is ready; only then say one short sentence.",
  },
  defer: {
    ok: true,
    status: "done",
    message: "The coloring sheet is now on the canvas. Tell the child it's ready for them to color in.",
  },
};

const SYSTEM_INSTRUCTION = buildSystemInstruction(MODE, TOOL_SHAPE);

// ---------------------------------------------------------------------------
// Recording state
// ---------------------------------------------------------------------------

const t0 = Date.now();
const now = () => Date.now() - t0;
const events = [];
const pcmChunks = [];
let turnIndex = 0;
const turns = [];
let cur = null;

function newTurn() {
  cur = { i: ++turnIndex, audioChunks: 0, audioBytes: 0, firstAudioAt: null, lastAudioAt: null, transcript: "", hadToolCall: false };
  turns.push(cur);
  return cur;
}
function rec(dir, type, extra) {
  events.push({ t: now(), dir, type, ...extra });
}
function logLine(s) {
  console.log(`[${String(now()).padStart(6)}ms] ${s}`);
}

// ---------------------------------------------------------------------------
// WebSocket wiring — mirrors gemini-live-client.ts
// ---------------------------------------------------------------------------

const ws = new WebSocket(`${GEMINI_WS_BASE}?key=${API_KEY}`);
ws.binaryType = "arraybuffer";

let setupComplete = false;
let genStartedAt = null;
let genFinished = false;
let finalizing = false;
let sessionHadToolCall = false;
let idleTimer = null;
let nudgeCount = 0;
// Reliability facts about the draw request.
let drawToolName = null;   // which tool the model used to draw
let drawSubject = null;    // subject argument it passed
let nudgesAtDrawCall = null; // how many nudges preceded the draw call (0 = first ask)

function send(obj, label) {
  ws.send(JSON.stringify(obj));
  rec("out", label, { payload: obj });
}
function sendClientText(text, turnComplete) {
  send(
    { clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete } },
    turnComplete ? "clientContent(turnComplete)" : "sendContext",
  );
}
function sendToolResponse(id, name, response) {
  send({ toolResponse: { functionResponses: [{ id, name, response }] } }, "toolResponse");
}
function pushGameStateUpdate() {
  if (!SEND_CONTEXT) return;
  const s1 = JSON.stringify({ currentColor: "#111111", brushSize: 8, strokeCount: 1, lastAction: "generated_image" });
  sendClientText(`[GAME STATE UPDATE #1]\nThis is the CURRENT game state. Previous updates are outdated.\n${s1}`, false);
}

ws.addEventListener("open", () => {
  logLine(`WS open → sending setup (mode=${MODE}, model=${MODEL})`);
  const setup = {
    model: `models/${MODEL}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: [{ functionDeclarations: TOOLS }],
  };
  send({ setup }, "setup");
});

ws.addEventListener("message", (ev) => {
  const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(new Uint8Array(ev.data));
  handleMessage(raw);
});
ws.addEventListener("error", (e) => {
  logLine(`WS error: ${e?.message || e}`);
  rec("in", "wsError", { message: String(e?.message || e) });
});
ws.addEventListener("close", (e) => {
  logLine(`WS closed code=${e.code} reason=${e.reason || "(none)"}`);
  rec("in", "wsClose", { code: e.code, reason: e.reason });
  finalize();
});

function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    rec("in", "parseError", { raw: raw.slice(0, 300) });
    return;
  }

  if (msg.setupComplete !== undefined) {
    setupComplete = true;
    logLine("setupComplete → sending draw request");
    rec("in", "setupComplete", {});
    newTurn();
    sendClientText(PROMPT, true);
    return;
  }
  if (msg.toolCall) {
    for (const fc of msg.toolCall.functionCalls || []) handleToolCall(fc);
    return;
  }

  const sc = msg.serverContent;
  if (!sc) {
    if (msg.goAway) rec("in", "goAway", { goAway: msg.goAway });
    return;
  }
  if (sc.interrupted) {
    logLine("*** INTERRUPTED ***");
    rec("in", "interrupted", {});
    return;
  }
  if (sc.modelTurn?.parts) {
    for (const part of sc.modelTurn.parts) {
      if (part.inlineData?.data) {
        const buf = Buffer.from(part.inlineData.data, "base64");
        pcmChunks.push(buf);
        if (!cur) newTurn();
        cur.audioChunks++;
        cur.audioBytes += buf.length;
        if (cur.firstAudioAt === null) {
          cur.firstAudioAt = now();
          logLine(`T${cur.i}: first audio chunk`);
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        }
        cur.lastAudioAt = now();
        rec("in", "audio", { bytes: buf.length, turn: cur.i, n: cur.audioChunks });
      }
      if (part.text) rec("in", "text", { text: part.text, turn: cur?.i });
      if (part.functionCall) handleToolCall(part.functionCall);
    }
  }
  if (sc.outputTranscription?.text) {
    if (!cur) newTurn();
    cur.transcript += sc.outputTranscription.text;
    rec("in", "outputTranscription", { text: sc.outputTranscription.text, turn: cur.i });
  }
  if (sc.inputTranscription?.text) rec("in", "inputTranscription", { text: sc.inputTranscription.text });

  if (sc.turnComplete) {
    const dur = cur ? cur.audioBytes / 2 / 24000 : 0;
    logLine(
      `T${cur?.i} COMPLETE: audioChunks=${cur?.audioChunks} audioSec=${dur.toFixed(2)} ` +
      `transcript="${(cur?.transcript || "").trim().slice(0, 160)}"`,
    );
    rec("in", "turnComplete", { turn: cur?.i, audioChunks: cur?.audioChunks, audioSec: dur });
    const completedToolTurn = cur?.hadToolCall;
    cur = null;
    newTurn();
    if (completedToolTurn && genFinished) setTimeout(finalize, 1500);
    else if (genFinished) setTimeout(finalize, 4000);
    else if (!sessionHadToolCall && !genStartedAt) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (sessionHadToolCall || genStartedAt) return;
        if (nudgeCount < MAX_NUDGES) {
          const text = NUDGES[Math.min(nudgeCount, NUDGES.length - 1)];
          nudgeCount++;
          logLine(`nudge ${nudgeCount}/${MAX_NUDGES}: "${text}"`);
          cur = null;
          newTurn();
          sendClientText(text, true);
        } else {
          logLine("idle: no tool call after nudges — finalizing");
          finalize();
        }
      }, 2500);
    }
  }
}

function handleToolCall(fc) {
  const id = fc.id ?? fc.name ?? "";
  const name = fc.name;
  const fargs = fc.args ?? {};
  sessionHadToolCall = true;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (cur) cur.hadToolCall = true;
  logLine(`TOOL CALL: ${name}(${JSON.stringify(fargs)})`);
  rec("in", "toolCall", { id, name, args: fargs });

  const isDraw =
    TOOL_SHAPE === "first-class"
      ? name === "generate_drawing"
      : name === "execute_game_command" && fargs?.type === "generate_drawing";

  if (isDraw && drawToolName === null) {
    drawToolName = name;
    drawSubject =
      TOOL_SHAPE === "first-class" ? (fargs?.subject ?? null) : (fargs?.payload?.subject ?? null);
    nudgesAtDrawCall = nudgeCount;
    logLine(`DRAW via ${name}(subject=${JSON.stringify(drawSubject)}) after ${nudgeCount} nudge(s)`);
  }

  if (!isDraw) {
    sendToolResponse(id, name, { ok: true, command: fargs?.type ?? name });
    return;
  }

  genStartedAt = now();
  logLine(`generate_drawing → simulating ${GEN_MS}ms of image generation (mode=${MODE})`);

  if (MODE === "defer") {
    // Hold the response until generation finishes.
    setTimeout(() => {
      genFinished = true;
      logLine("generation finished → sending deferred tool response");
      sendToolResponse(id, name, TOOL_RESPONSES.defer);
    }, GEN_MS);
  } else {
    // immediate / prompt-suppress: answer now, push state update at the end.
    sendToolResponse(id, name, TOOL_RESPONSES[MODE]);
    setTimeout(() => {
      genFinished = true;
      logLine("generation finished → pushing [GAME STATE UPDATE]");
      pushGameStateUpdate();
      // Fallback: if the model never produces a completion turn (e.g. it stays
      // silent under prompt-suppress), don't idle to the hard cap.
      setTimeout(() => {
        if (!finalizing) { logLine("post-gen fallback finalize (no completion turn)"); finalize(); }
      }, 9000);
    }, GEN_MS);
  }
}

// ---------------------------------------------------------------------------
// Finalize: write recordings + analysis (incl. phase buckets)
// ---------------------------------------------------------------------------

setTimeout(() => {
  logLine("HARD CAP reached");
  finalize();
}, HARD_CAP_MS);

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim().toLowerCase().replace(/[.!?…,]+$/, ""))
    .filter((s) => s.length > 3);
}
function repetitionReport(text) {
  const sents = splitSentences(text);
  const counts = new Map();
  for (const s of sents) counts.set(s, (counts.get(s) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  return {
    sentenceCount: sents.length,
    uniqueSentences: counts.size,
    mostRepeated: top ? { text: top[0], count: top[1] } : null,
  };
}
function phaseBuckets() {
  const tCall = events.find((e) => e.dir === "in" && e.type === "toolCall")?.t ?? null;
  const tResp = events.find((e) => e.dir === "out" && e.type === "toolResponse")?.t ?? null;
  const ph = { preamble: { b: 0, n: 0 }, window: { b: 0, n: 0 }, post: { b: 0, n: 0 } };
  for (const e of events) {
    if (e.dir !== "in" || e.type !== "audio") continue;
    let k;
    if (tCall === null || e.t < tCall) k = "preamble";
    else if (tResp === null || e.t < tResp) k = "window";
    else k = "post";
    ph[k].b += e.bytes;
    ph[k].n++;
  }
  const sec = (b) => Number((b / 2 / 24000).toFixed(2));
  return {
    tCallMs: tCall,
    tRespMs: tResp,
    pendingWindowMs: tCall != null && tResp != null ? tResp - tCall : null,
    preamble: { audioSec: sec(ph.preamble.b), chunks: ph.preamble.n },
    window: { audioSec: sec(ph.window.b), chunks: ph.window.n },
    post: { audioSec: sec(ph.post.b), chunks: ph.post.n },
  };
}
function writeWav(path, pcm) {
  const data = Buffer.concat(pcm);
  const h = Buffer.alloc(44);
  const sr = 24000, ch = 1, bits = 16;
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE((sr * ch * bits) / 8, 28); h.writeUInt16LE((ch * bits) / 8, 32);
  h.writeUInt16LE(bits, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
  return data.length / 2 / sr;
}

function finalize() {
  if (finalizing) return;
  finalizing = true;
  try { ws.close(); } catch {}

  const wavSec = writeWav(join(OUT, "dodi.wav"), pcmChunks);
  writeFileSync(join(OUT, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n"));

  const shown = turns.filter((t) => t.transcript.trim() || t.audioChunks);
  writeFileSync(
    join(OUT, "transcript.txt"),
    shown
      .map((t) => `--- T${t.i} (audioChunks=${t.audioChunks}, audioSec=${(t.audioBytes / 2 / 24000).toFixed(2)}, hadToolCall=${t.hadToolCall}) ---\n${t.transcript.trim()}`)
      .join("\n\n") + "\n",
  );

  const toolTurn = turns.find((t) => t.hadToolCall);
  const phases = phaseBuckets();
  const summary = {
    mode: MODE, model: MODEL, voice: VOICE, genMs: GEN_MS, sendContext: SEND_CONTEXT, prompt: PROMPT,
    toolShape: TOOL_SHAPE,
    totalAudioSec: Number(wavSec.toFixed(2)),
    calledTool: !!toolTurn,
    // Reliability facts: which tool drew, the subject it passed, and whether it
    // fired on the first ask (nudgesAtDrawCall === 0) vs only after nudging.
    drewPicture: drawToolName !== null,
    drawToolName,
    drawSubject,
    nudgesAtDrawCall,
    drewOnFirstAsk: drawToolName !== null && nudgesAtDrawCall === 0,
    phases,
    toolTurnRepetition: toolTurn ? repetitionReport(toolTurn.transcript) : null,
    turns: shown.map((t) => ({
      turn: t.i, audioChunks: t.audioChunks, audioSec: Number((t.audioBytes / 2 / 24000).toFixed(2)),
      hadToolCall: t.hadToolCall, transcript: t.transcript.trim(),
    })),
  };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("\n================ SUMMARY ================");
  console.log(`mode=${MODE} tools=${TOOL_SHAPE} model=${MODEL} genMs=${GEN_MS} totalAudioSec=${wavSec.toFixed(2)} calledTool=${!!toolTurn}`);
  console.log(
    `DREW=${drawToolName !== null} via=${drawToolName ?? "-"} subject=${JSON.stringify(drawSubject)} ` +
    `nudgesBeforeDraw=${nudgesAtDrawCall ?? "-"} firstAsk=${drawToolName !== null && nudgesAtDrawCall === 0}`,
  );
  if (toolTurn) {
    console.log(
      `PHASES  preamble=${phases.preamble.audioSec}s(${phases.preamble.chunks})  ` +
      `pending-window=${phases.window.audioSec}s(${phases.window.chunks})[${phases.pendingWindowMs}ms]  ` +
      `post=${phases.post.audioSec}s(${phases.post.chunks})`,
    );
    const rep = summary.toolTurnRepetition;
    if (rep?.mostRepeated) console.log(`MOST REPEATED (${rep.mostRepeated.count}x): "${rep.mostRepeated.text}"`);
  } else {
    console.log("No generate_drawing tool call captured.");
  }
  console.log(`artifacts in: ${OUT}`);
  console.log("=========================================");
  process.exit(0);
}
