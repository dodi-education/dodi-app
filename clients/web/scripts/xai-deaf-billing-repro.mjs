#!/usr/bin/env node
/**
 * Reproduce xAI Speech-to-Speech billing for open WebSocket phases:
 *
 *   1. (optional) ACTIVE  — stream PCM for --start-audio-minutes
 *   2. DEAF               — socket stays open, zero audio for --minutes
 *
 * Then close and compare wall-clock phases to billed audio minutes.
 *
 * Auth matches the browser client: mint an ephemeral token with the API key,
 * then open the socket with subprotocol `xai-client-secret.<token>` (Node's
 * built-in WebSocket cannot set Authorization headers).
 *
 * Usage:
 *   export XAI_API_KEY=xai-...
 *   node xai-deaf-billing-repro.mjs
 *
 *   # 1 min of client audio, then 3 min deaf (no audio):
 *   node xai-deaf-billing-repro.mjs --start-audio-minutes 1 --minutes 3
 *
 *   node xai-deaf-billing-repro.mjs --api-key xai-... --minutes 3
 *
 * Requires: Node 22+ (built-in fetch + WebSocket). No npm packages.
 */

const XAI_BASE_URL = "https://api.x.ai/v1";
const XAI_REALTIME_WS = "wss://api.x.ai/v1/realtime";
const DEFAULT_MODEL = "grok-voice-latest";
const DEFAULT_VOICE = "ara";
const DEFAULT_MINUTES = 3;
const DEFAULT_START_AUDIO_MINUTES = 0;

/** Match dodi web client: PCM16 mono @ 16 kHz. */
const INPUT_SAMPLE_RATE = 16000;
const INPUT_BYTES_PER_SAMPLE = 2;
/** Real-time chunk size (100 ms). */
const CHUNK_MS = 100;

const AUDIO_DELTA_TYPES = new Set([
  "response.output_audio.delta",
  "response.audio.delta",
]);

function parseArgs(argv) {
  const out = {
    apiKey: process.env.XAI_API_KEY || process.env.XAI_KEY || "",
    model: DEFAULT_MODEL,
    voice: DEFAULT_VOICE,
    minutes: DEFAULT_MINUTES,
    startAudioMinutes: DEFAULT_START_AUDIO_MINUTES,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--api-key") out.apiKey = argv[++i] ?? "";
    else if (a === "--model") out.model = argv[++i] ?? DEFAULT_MODEL;
    else if (a === "--voice") out.voice = argv[++i] ?? DEFAULT_VOICE;
    else if (a === "--minutes") out.minutes = Number(argv[++i]);
    else if (a === "--start-audio-minutes")
      out.startAudioMinutes = Number(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function printHelp() {
  console.log(`Usage:
  export XAI_API_KEY=xai-...
  node xai-deaf-billing-repro.mjs

  # Pure deaf (no client audio):
  node xai-deaf-billing-repro.mjs --minutes 3

  # Active audio then deaf:
  node xai-deaf-billing-repro.mjs --start-audio-minutes 1 --minutes 3

Options:
  --api-key                 xAI API key (or env XAI_API_KEY)
  --model                   default: ${DEFAULT_MODEL}
  --voice                   default: ${DEFAULT_VOICE}
  --start-audio-minutes N   stream PCM for N minutes first (default: ${DEFAULT_START_AUDIO_MINUTES})
                            Uses silent PCM16 mono @ 16 kHz at real-time rate
                            (still "audio sent" for billing — not speech).
  --minutes N               deaf hold after that: open socket, zero audio
                            (default: ${DEFAULT_MINUTES})
`);
}

/**
 * @param {string} apiKey
 * @param {number} ttlSeconds
 */
async function mintEphemeralToken(apiKey, ttlSeconds) {
  const res = await fetch(`${XAI_BASE_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      expires_after: { seconds: ttlSeconds },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ephemeral token request failed (${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const data = await res.json();
  const token =
    data.value ?? data.client_secret?.value ?? data.secret ?? data.token;
  if (typeof token !== "string" || !token) {
    throw new Error(
      `ephemeral token response contained no token: ${JSON.stringify(data)}`,
    );
  }
  return token;
}

/** Silent PCM16 LE mono frame of duration chunkMs. */
function makeSilentPcmBase64(chunkMs) {
  const samples = Math.round((INPUT_SAMPLE_RATE * chunkMs) / 1000);
  const bytes = samples * INPUT_BYTES_PER_SAMPLE;
  // Node Buffer → base64 (all zeros = digital silence).
  return Buffer.alloc(bytes, 0).toString("base64");
}

/**
 * Stream silent input_audio_buffer.append frames in real time for `minutes`.
 * @returns {{ appendCount: number, pcmSeconds: number, wallSeconds: number, aborted: boolean }}
 */
async function streamClientAudio(ws, minutes) {
  const totalMs = minutes * 60 * 1000;
  const chunkB64 = makeSilentPcmBase64(CHUNK_MS);
  const phaseStart = performance.now();
  let appendCount = 0;
  let nextAt = phaseStart;

  log(
    `ACTIVE: streaming silent PCM16 @ ${INPUT_SAMPLE_RATE} Hz for ${minutes} min ` +
      `(${CHUNK_MS} ms chunks, real-time)…`,
  );

  while (performance.now() - phaseStart < totalMs) {
    if (ws.readyState !== WebSocket.OPEN) {
      log("ACTIVE: socket closed early while sending audio.");
      return {
        appendCount,
        pcmSeconds: (appendCount * CHUNK_MS) / 1000,
        wallSeconds: (performance.now() - phaseStart) / 1000,
        aborted: true,
      };
    }

    ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: chunkB64,
      }),
    );
    appendCount++;

    nextAt += CHUNK_MS;
    const delay = nextAt - performance.now();
    if (delay > 0) await sleep(delay);

    if (appendCount % 100 === 0) {
      // Every ~10 s at 100 ms chunks
      const wall = (performance.now() - phaseStart) / 1000;
      const pcm = (appendCount * CHUNK_MS) / 1000;
      log(
        `  … sending audio  wall=${wall.toFixed(1)}s  pcm_sent≈${pcm.toFixed(1)}s  appends=${appendCount}`,
      );
    }
  }

  const wallSeconds = (performance.now() - phaseStart) / 1000;
  const pcmSeconds = (appendCount * CHUNK_MS) / 1000;
  log(
    `ACTIVE done: appends=${appendCount}  pcm_sent≈${pcmSeconds.toFixed(1)}s  wall=${wallSeconds.toFixed(1)}s`,
  );
  return { appendCount, pcmSeconds, wallSeconds, aborted: false };
}

/**
 * Hold the socket open with zero client traffic.
 * @returns {{ wallSeconds: number, aborted: boolean }}
 */
async function holdDeaf(ws, minutes, t0, eventCounts, getAudioDeltaCount) {
  const idleMs = minutes * 60 * 1000;
  const phaseStart = performance.now();

  log(`DEAF: sitting idle for ${minutes} min (no client messages)…`);

  const deadline = phaseStart + idleMs;
  while (performance.now() < deadline) {
    if (ws.readyState !== WebSocket.OPEN) {
      log("DEAF: socket closed early during idle hold.");
      return {
        wallSeconds: (performance.now() - phaseStart) / 1000,
        aborted: true,
      };
    }
    const remaining = deadline - performance.now();
    await sleep(Math.min(30_000, remaining));
    const held = (performance.now() - t0) / 1000;
    const totalEvents = [...eventCounts.values()].reduce((a, b) => a + b, 0);
    log(
      `  … still deaf  wall=${held.toFixed(1).padStart(5)}s  events=${totalEvents}  audio_deltas=${getAudioDeltaCount()}`,
    );
  }

  return {
    wallSeconds: (performance.now() - phaseStart) / 1000,
    aborted: false,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.voice
 * @param {number} opts.minutes
 * @param {number} opts.startAudioMinutes
 */
async function run({ apiKey, model, voice, minutes, startAudioMinutes }) {
  const totalMinutes = startAudioMinutes + minutes;
  // Token must outlive the whole run; keep a 2 min buffer, floor 5 min.
  const ttlSeconds = Math.max(
    300,
    Math.ceil(totalMinutes * 60) + 120,
  );

  /** @type {Map<string, number>} */
  const eventCounts = new Map();
  let audioDeltaCount = 0;
  let audioDeltaB64Chars = 0;
  /** @type {string[]} */
  const clientSends = [];
  /** @type {{ by: string, code: number, reason: string } | null} */
  let closed = null;

  let audioPhase = {
    appendCount: 0,
    pcmSeconds: 0,
    wallSeconds: 0,
    aborted: false,
  };
  let deafPhase = { wallSeconds: 0, aborted: false };

  const bump = (type) => {
    eventCounts.set(type, (eventCounts.get(type) ?? 0) + 1);
  };

  log("Minting ephemeral client secret (POST /v1/realtime/client_secrets)…");
  let token;
  try {
    token = await mintEphemeralToken(apiKey, ttlSeconds);
  } catch (err) {
    log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
    return;
  }
  log(`Ephemeral token OK (ttl=${ttlSeconds}s for ~${totalMinutes.toFixed(2)} min run)`);

  const subprotocol = token.startsWith("xai-client-secret.")
    ? token
    : `xai-client-secret.${token}`;
  const url = `${XAI_REALTIME_WS}?model=${encodeURIComponent(model)}`;

  log(`Connecting to ${url}`);
  log(
    `Plan: start-audio=${startAudioMinutes} min → deaf=${minutes} min ` +
      `(total open ≈ ${totalMinutes} min)`,
  );
  log("Auth: WebSocket subprotocol xai-client-secret.* (same as dodi web client)");

  const t0 = performance.now();
  const ws = new WebSocket(url, [subprotocol]);

  /** @type {((v?: unknown) => void) | null} */
  let resolveSetup = null;
  /** @type {((e: Error) => void) | null} */
  let rejectSetup = null;
  const setupDone = new Promise((resolve, reject) => {
    resolveSetup = resolve;
    rejectSetup = reject;
  });

  /** "audio" while streaming client PCM; "deaf" after. Affects log wording only. */
  let phaseLabel = "setup";

  ws.addEventListener("open", () => {
    log("WebSocket OPEN");
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
      msg = JSON.parse(raw);
    } catch {
      bump("<non-json>");
      log("  ← non-JSON frame");
      return;
    }

    const etype = msg.type || "<missing-type>";
    bump(etype);

    if (AUDIO_DELTA_TYPES.has(etype)) {
      audioDeltaCount++;
      if (typeof msg.delta === "string") {
        audioDeltaB64Chars += msg.delta.length;
      }
      if (audioDeltaCount === 1) {
        const note =
          phaseLabel === "deaf"
            ? "UNEXPECTED during deaf: server audio while client sent none"
            : phaseLabel === "audio"
              ? "server audio (possible if VAD/model reacts to input)"
              : "server audio during setup";
        log(`  ← ${etype}  (${note})`);
      } else if (audioDeltaCount % 50 === 0) {
        log(`  ← ${etype} x${audioDeltaCount}`);
      }
      return;
    }

    if (etype === "error") {
      log(`  ← error: ${JSON.stringify(msg.error ?? msg)}`);
      return;
    }

    if (etype === "session.created") {
      log(`  ← ${etype}`);
      // Same shape as XaiVoiceClient.sendSessionUpdate (no tools, no greeting).
      const sessionUpdate = {
        type: "session.update",
        session: {
          instructions:
            "You are a silent test harness. Do not speak unless spoken to.",
          voice,
          turn_detection: { type: "server_vad" },
          audio: {
            input: {
              format: { type: "audio/pcm", rate: INPUT_SAMPLE_RATE },
              transcription: {},
            },
            output: {
              format: { type: "audio/pcm", rate: 24000 },
            },
          },
        },
      };
      ws.send(JSON.stringify(sessionUpdate));
      clientSends.push("session.update");
      log("  → session.update (instructions + server_vad + pcm formats)");
      return;
    }

    if (etype === "session.updated") {
      log(`  ← ${etype}`);
      resolveSetup?.();
      return;
    }

    if (typeof etype === "string" && etype.startsWith("response.")) {
      log(
        `  ← ${etype}  (server response; phase=${phaseLabel}${
          phaseLabel === "deaf" ? " — unexpected without client prompt" : ""
        })`,
      );
      return;
    }

    log(`  ← ${etype}`);
  });

  ws.addEventListener("error", () => {
    log("WebSocket error event (see close code for detail)");
  });

  const closedPromise = new Promise((resolve) => {
    ws.addEventListener("close", (ev) => {
      if (!closed) {
        closed = {
          by: ev.wasClean ? "clean" : "unclean",
          code: ev.code,
          reason: ev.reason || "",
        };
      }
      log(
        `WebSocket CLOSED code=${ev.code} reason=${JSON.stringify(ev.reason || "")} wasClean=${ev.wasClean}`,
      );
      resolve(undefined);
    });
  });

  ws.addEventListener("close", () => {
    if (resolveSetup) {
      rejectSetup?.(
        new Error(
          `socket closed before session.updated (code=${closed?.code} reason=${closed?.reason})`,
        ),
      );
    }
  });

  try {
    await Promise.race([
      setupDone,
      sleep(30_000).then(() => {
        throw new Error("timed out waiting for session.updated (30s)");
      }),
    ]);
  } catch (err) {
    log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    try {
      ws.close(1000, "setup-failed");
    } catch {
      /* ignore */
    }
    printSummary({
      model,
      voice,
      minutes,
      startAudioMinutes,
      t0,
      clientSends,
      eventCounts,
      audioDeltaCount,
      audioDeltaB64Chars,
      closed,
      audioPhase,
      deafPhase,
    });
    process.exitCode = 2;
    await closedPromise;
    return;
  }

  resolveSetup = null;
  rejectSetup = null;

  log("Session ready.");

  // --- Phase 1: optional client audio ---
  if (startAudioMinutes > 0) {
    phaseLabel = "audio";
    audioPhase = await streamClientAudio(ws, startAudioMinutes);
    clientSends.push(
      `input_audio_buffer.append x${audioPhase.appendCount} (~${audioPhase.pcmSeconds.toFixed(1)}s silent PCM)`,
    );
    if (audioPhase.aborted || ws.readyState !== WebSocket.OPEN) {
      printSummary({
        model,
        voice,
        minutes,
        startAudioMinutes,
        t0,
        clientSends,
        eventCounts,
        audioDeltaCount,
        audioDeltaB64Chars,
        closed,
        audioPhase,
        deafPhase,
      });
      process.exitCode = 2;
      await closedPromise;
      return;
    }
  } else {
    log("ACTIVE: skipped (--start-audio-minutes 0)");
  }

  // --- Phase 2: deaf hold ---
  phaseLabel = "deaf";
  deafPhase = await holdDeaf(
    ws,
    minutes,
    t0,
    eventCounts,
    () => audioDeltaCount,
  );

  const held = (performance.now() - t0) / 1000;
  if (ws.readyState === WebSocket.OPEN) {
    log(`Idle window finished (wall=${held.toFixed(1)}s). Closing client side…`);
    closed = {
      by: "client",
      code: 1000,
      reason: "deaf-billing-repro done",
    };
    ws.close(1000, "deaf-billing-repro done");
  }

  await closedPromise;

  printSummary({
    model,
    voice,
    minutes,
    startAudioMinutes,
    t0,
    clientSends,
    eventCounts,
    audioDeltaCount,
    audioDeltaB64Chars,
    closed,
    audioPhase,
    deafPhase,
  });
}

function printSummary({
  model,
  voice,
  minutes,
  startAudioMinutes,
  t0,
  clientSends,
  eventCounts,
  audioDeltaCount,
  audioDeltaB64Chars,
  closed,
  audioPhase,
  deafPhase,
}) {
  const wall = (performance.now() - t0) / 1000;
  const totalEvents = [...eventCounts.values()].reduce((a, b) => a + b, 0);
  const sorted = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]);
  const audioSentMin = (audioPhase?.pcmSeconds ?? 0) / 60;
  const deafMin = (deafPhase?.wallSeconds ?? 0) / 60;
  const wallMin = wall / 60;

  console.log();
  console.log("=".repeat(60));
  console.log("SUMMARY — xAI deaf / idle billing repro");
  console.log("=".repeat(60));
  console.log(`  model:              ${model}`);
  console.log(`  voice:              ${voice}`);
  console.log(
    `  requested ACTIVE:  ${startAudioMinutes} min client audio (silent PCM)`,
  );
  console.log(`  requested DEAF:    ${minutes} min open, zero audio`);
  console.log(
    `  ACTIVE measured:   pcm≈${(audioPhase?.pcmSeconds ?? 0).toFixed(1)}s ` +
      `wall=${(audioPhase?.wallSeconds ?? 0).toFixed(1)}s ` +
      `appends=${audioPhase?.appendCount ?? 0}` +
      (audioPhase?.aborted ? "  (aborted)" : ""),
  );
  console.log(
    `  DEAF measured:     wall=${(deafPhase?.wallSeconds ?? 0).toFixed(1)}s` +
      (deafPhase?.aborted ? "  (aborted)" : ""),
  );
  console.log(
    `  wall-clock open:    ${wall.toFixed(1)}s  (${wallMin.toFixed(2)} min)`,
  );
  console.log(
    `  closed:             by=${closed?.by ?? "?"}  code=${closed?.code ?? "?"}  reason=${JSON.stringify(closed?.reason ?? "")}`,
  );
  console.log(
    `  client API sends:   ${clientSends.length ? clientSends.join(" | ") : "(none after connect)"}`,
  );
  console.log(
    `  client audio sends: ${audioPhase?.appendCount ?? 0} appends ` +
      `(≈${(audioPhase?.pcmSeconds ?? 0).toFixed(1)}s silent PCM @ ${INPUT_SAMPLE_RATE} Hz)`,
  );
  console.log("  client text turns:  0  (conversation.item.create never sent)");
  console.log(`  server audio deltas:${audioDeltaCount}`);
  if (audioDeltaCount) {
    console.log(`  ~base64 audio chars:${audioDeltaB64Chars}`);
  }
  console.log(`  server events:      ${totalEvents} total`);
  for (const [name, count] of sorted) {
    console.log(`    ${String(count).padStart(5)}  ${name}`);
  }
  console.log();
  console.log("What to check next in xAI billing / usage:");
  console.log(
    `  • Expected if only "audio sent" counts:     ≈ ${audioSentMin.toFixed(2)} min`,
  );
  console.log(
    `  • Expected if connection/session time:      ≈ ${wallMin.toFixed(2)} min`,
  );
  console.log(
    `  • Expected if audio-sent + deaf still billed: ≈ ${(audioSentMin + deafMin).toFixed(2)} min`,
  );
  console.log(
    `  • If billed ≈ wall (${wallMin.toFixed(2)} min) with start-audio=${startAudioMinutes} + deaf=${minutes}: meter is session time.`,
  );
  console.log(
    `  • If billed ≈ ${audioSentMin.toFixed(2)} min only: deaf hold is free (docs match).`,
  );
  if (audioDeltaCount) {
    console.log(
      '  • Server audio deltas may also count as "audio received" on top of client PCM.',
    );
  }
  console.log("=".repeat(60));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}
if (!args.apiKey) {
  console.error(
    "Provide an API key:\n" +
      "  export XAI_API_KEY=xai-...\n" +
      "  node xai-deaf-billing-repro.mjs\n" +
      "or:\n" +
      "  node xai-deaf-billing-repro.mjs --api-key xai-...",
  );
  process.exit(2);
}
if (!(args.minutes > 0)) {
  console.error("--minutes must be > 0");
  process.exit(2);
}
if (!(args.startAudioMinutes >= 0) || Number.isNaN(args.startAudioMinutes)) {
  console.error("--start-audio-minutes must be >= 0");
  process.exit(2);
}

await run(args);
