# Voice session debug harness

Offline reproduction / measurement rig for the Gemini Live voice companion. It
connects to the Live API over WebSocket exactly like
`clients/web/src/lib/ai/gemini-live-client.ts`, using the real game-voice system
instruction + tool declarations (mirrored from `core/ai/src/dodi-context.ts` and
the Drawing briefing in `platform/supabase/remote-drawing-game-patch.sql`), and
drives the "draw a dog" scenario. No browser / vault / Supabase needed.

> Note: the system instruction + tool declarations are **mirrored** (copied) from
> the source files, not imported, so the harness stays a zero-build standalone
> script. If you change `dodi-context.ts` or the Drawing briefing, re-sync the
> strings at the top of `harness.mjs`.

## Setup

Create `key.env` (gitignored) with a raw Gemini API key that has Live-API access:

```
GEMINI_API_KEY=AIza...
```

## Run

```bash
./run.sh --mode=immediate         # current app behavior (reproduces the loop bug)
./run.sh --mode=prompt-suppress   # "stay silent while generating" prompt-only fix
./run.sh --mode=defer             # hold the tool response until generation done

# knobs: --gen-ms=12000  --model=...  --voice=Kore  --prompt="..."  --no-context
#        --tools=generic|first-class  --max-nudges=N

node batch.mjs 4 immediate prompt-suppress defer   # N trials/mode + comparison table
node analyze.mjs run-immediate                     # per-second transcript timeline

# Tool-call RELIABILITY experiment (generic vs. first-class generate_drawing):
set -a; . ./key.env; set +a
node reliability.mjs 8 generic first-class          # N paired trials/shape + draw-rate table
```

## Tool-call reliability (`--tools` + reliability.mjs)

Separate from the silence/timing modes above, `--tools` changes how `generate_drawing`
is **declared** to the model — testing whether a dedicated tool is called more reliably:

- `--tools=generic` (default) — draw goes through the umbrella `execute_game_command`
  tool as `{type:"generate_drawing", payload:{subject}}` (current app path).
- `--tools=first-class` — `generate_drawing(subject)` is its own top-level tool.

`reliability.mjs` runs N **single-ask** trials per shape (`--max-nudges=0`, so a miss
is a real miss, not papered over by nudging) with the SAME prompt per trial index across
both shapes (paired design), and prints a first-ask draw-rate comparison. Each run's
`summary.json` now also carries `drewPicture`, `drawToolName`, `drawSubject`,
`nudgesAtDrawCall`, and `drewOnFirstAsk`.

## What it records (per run, in `run-<mode>/` or `batch/<mode>-<n>/`)

- `dodi.wav` — all model audio (24kHz/16-bit/mono)
- `transcript.txt` — Dodi's transcript, segmented per turn
- `events.jsonl` — every in/out message, timestamped
- `summary.json` — per-turn + per-**phase** audio and a repetition report

## The phase model (the key metric)

Each `generate_drawing` turn is split into three phases:

| phase | span | meaning |
|-------|------|---------|
| `preamble` | before the tool call | the model's initial reply |
| `pending-window` | tool call → our tool **response** | **the generation window — should be silent** |
| `post` | after the tool response | the completion announcement |

Measured fact: while a function call is **pending (unanswered)** the model emits
**zero audio**. So the `defer` mode keeps `pending-window` silent by construction;
`immediate` collapses that window to 0ms and lets the model talk (and loop)
straight through generation. `prompt-suppress` tests whether wording alone keeps
it quiet under the immediate-answer timing.

## Modes

- **immediate** — answers the tool call instantly with the "tell the child it's
  on the way" message, pushes `[GAME STATE UPDATE]` when generation finishes.
  Reproduces the repeat-the-same-line bug.
- **prompt-suppress** — same timing, but the system instruction + tool response
  tell the model to stay completely silent until the `[GAME STATE UPDATE]`.
- **defer** — holds the tool response until generation finishes (idiomatic async
  tool pattern); the model is suspended/silent while pending, then speaks once.
