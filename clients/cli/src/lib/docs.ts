/**
 * `dodi docs`: the authoring guide, offline and versioned with the CLI. The
 * technical sections are the very texts Game Studio's own agent is prompted
 * with (bridge contract, command vocabulary, success metrics, canvas, design
 * language), imported from @dodi/games, so a game built here behaves exactly
 * like one built in the app. Only the workflow around them is CLI-specific.
 */
import { designLanguageDoc } from "@dodi/games/design-language";
import { BRIDGE_INTERFACE_TEMPLATE } from "@dodi/games/game-spec";
import { GAME_CANVAS_TEMPLATE } from "@dodi/games/stage";
import { SUCCESS_SYSTEM_TEMPLATE } from "@dodi/games/success";
import { GAME_TAG_IDS } from "@dodi/games/tags";
import { DECLARABLE_CAPABILITY_NAMES, standardCommandsDoc } from "@dodi/games/toolbox";
import { SUPPORTED_LOCALES } from "@dodi/intl/locales";
import type { GamePerspective } from "@dodi/types/games";

import { ASSET_DOC } from "./asset-docs";

const LOCALES = SUPPORTED_LOCALES.join(", ");

const START = `# Building on dodi with the dodi CLI

dodi is a learning platform for kids. A family's games, companion looks and
memories are end-to-end encrypted: this CLI seals everything on your machine
before it is uploaded, so the dodi server never sees it.

If \`dodi\` is not installed yet: \`npm install -g @dodi-education/cli\` (Node 20+).

## Workflow
1. \`dodi login\` prints an approval link. Send it to the parent and wait.
   If the command exits with code 3 (pending), run \`dodi login --resume\`
   after the parent approved.
2. \`dodi kids\` lists the kids you may build for (names and ages only if the
   parent granted it).
3. \`dodi games new <folder>\` scaffolds a game. Read \`dodi docs games\` first.
4. Edit game.html and game.md. Loop: \`dodi games check <folder>\` until it
   reports ok, and look at the frames it saves.
5. \`dodi games push <folder>\` uploads it to the family library.
6. Optional: \`dodi games publish <folder>\` submits it to dodi Discover for
   every family (reviewed before it goes live).

Every command takes --json. Exit codes: 0 ok, 1 error, 2 usage, 3 waiting for
approval, 4 check failed, 5 not connected (log in again), 6 missing scope.

## Topics
dodi docs games         the complete game authoring guide (read this first)
dodi docs format        game.md fields
dodi docs bridge        the postMessage bridge between game and app
dodi docs commands      the standard command vocabulary (capabilities)
dodi docs success       success criteria and progress metrics
dodi docs design        the visual design language (--perspective bird|side|isometric)
dodi docs translations  the in-game text and translations rules
dodi docs check         what \`dodi games check\` runs and checks.json
dodi docs publish       publishing to dodi Discover
dodi docs assets        custom companion avatars and accessories (3D, glTF)
`;

const FORMAT = `# The game folder

\`dodi games new\` creates this layout:

    game.html    the complete game: ONE self-contained HTML file
    game.md      front matter (below) + the companion briefing as the body
    preview.jpg  optional list picture, about 512x640, under 1 MB
    checks.json  optional runtime-check steps (see \`dodi docs check\`)
    AGENTS.md    a pointer for you

## game.md front matter (YAML)
title:              short, kid-friendly title (required, max 200 chars)
description:        one or two sentences for the parent
kid:                id of the kid whose library owns it (default: first kid)
audience:           "family" (every kid) or a list of kid ids
is_active:          true = kids see it in their library right away
age_min / age_max:  target ages, 1 to 25
duration_minutes:   rough play time, 1 to 180
tags:               from: ${GAME_TAG_IDS.join(", ")}
progress_kind:      goal (measurable objective) or open (free play)
capabilities:       the standard commands the game implements, from:
                    ${DECLARABLE_CAPABILITY_NAMES.join(", ")}
perspective:        optional: bird, side or isometric
learning_goal:      what the kid learns (plain text)
success_definition: when the kid succeeded, in the parent's words
success_criteria:   required for goal games, see \`dodi docs success\`
                    { description, match: all|any, conditions: [{ metric, op, value }] }
listing:            Discover listing per language (${LOCALES}):
                    { en: { title, description }, de: { title, description } }
game_id:            written by \`dodi games push\`; do not edit

## The body
Markdown the dodi companion reads while the kid plays: Game Overview, Rules,
Available Commands (each with parameters and a JSON example), State Fields,
Teaching Strategy (how to hint and encourage without giving answers away).
`;

const SANDBOX = `## Sandbox constraints
The game runs in an iframe with sandbox="allow-scripts" and NO network access.
game.html MUST NOT contain external scripts (<script src>), fetch(),
XMLHttpRequest, WebSocket, dynamic import(), navigator.sendBeacon or
document.cookie. Inline <script> and <style> only, under 200 KB in total.
Images are inline (data: URLs or SVG).`;

const PRIVACY = `## Privacy
Never put a kid's real name, birthday or any personal detail into game code,
titles, on-screen text or the briefing, even when \`dodi kids\` showed it to
you. Use neutral names ("the explorer", "Robot"). Use what you know about the
kid only to choose difficulty, themes and visuals.`;

const TRANSLATIONS = `## In-game text & translations (required)
Games are multilingual. game.html must contain exactly ONE inert translations
block in <head>, BEFORE any executable <script>:

<script type="application/dodi-translations">
{"sourceLocale":"en","locales":{"en":{"game.start":"Start","score.label":"{count} stars"},"de":{"game.start":"Los","score.label":"{count} Sterne"}}}
</script>

- Render ALL visible text through window.dodi.translate("key", { param: value }):
  DOM text, canvas fillText, buttons, feedback. The host defines dodi.translate
  before your scripts run; never define or overwrite it. It picks the language
  from dodi:init payload.locale.
- Literal keys only (dodi.translate("game.start")), lowercase dot-separated
  ([a-z0-9_.]+). Values are plain text (no HTML, no "<"), {param} placeholders,
  line breaks allowed, up to ~4000 characters.
- Long texts (stories, passages, riddles) belong in the block too.
- sourceLocale is the kid's language (see \`dodi kids\`). Inside the family any
  sourceLocale works; Discover needs every platform language (${LOCALES}) fully
  covered, so write all of them if you plan to publish.`;

const CHECK = `# dodi games check

Runs, in order:
1. The sanitizer and validator Game Studio uses: blocked APIs, size, the bridge
   protocol, declared capabilities present in code, goal-game metrics, the
   translations block.
2. game.md sanity: goal games need success criteria, description, briefing.
3. Discover readiness (warnings): every language translated, listing per language.
4. A real run in a headless browser, sandboxed like the apps: whether the game
   sent game:ready, uncaught errors and console.error output, overlapping UI,
   and screenshots saved to <folder>/.dodi/check/*.jpg. Look at them.
   --local uses Playwright on this machine (npx playwright install chromium);
   otherwise the dodi screenshot service renders it.

## checks.json (optional)
Up to 4 steps run after the opening screen, one frame each. A command is a
standard command from your capabilities (see \`dodi docs commands\`):

[
  { "label": "first answer", "command": { "type": "submit_answer", "answer": "3" }, "waitMs": 600 },
  { "label": "a moment later", "waitMs": 1500 }
]

Exit code 4 means errors were found; warnings never fail the check.`;

const PUBLISH = `# Publishing to dodi Discover

\`dodi games publish <folder>\` submits the pushed game for every family. It
needs the "games:publish" scope, and the parent must have picked a public
publication handle in the app once.

Requirements, enforced by the platform:
- the translations block fully covers every platform language (${LOCALES});
- game.md has listing.<locale>.title (and ideally description) for each;
- the bundle passes the platform sanitizer again (the copy is plaintext);
- the family's monthly publication limit is not used up.

A published copy is reviewed (automated security review, then a person)
before it goes live. Re-submitting after changes: push, then publish again.
\`dodi games status <folder>\` shows the review state.`;

function gamesGuide(perspective?: GamePerspective): string {
  return [
    "# Writing a dodi game",
    "",
    "Read this whole guide before writing game.html. Then `dodi docs format` for game.md.",
    "",
    SANDBOX,
    "",
    PRIVACY,
    "",
    BRIDGE_INTERFACE_TEMPLATE.trim(),
    "",
    standardCommandsDoc().trim(),
    "",
    "Implement handlers only for commands from this vocabulary, and list every one",
    "you implement under `capabilities:` in game.md and in your game:ready message.",
    "Stateful games MUST implement save/restore (dodi:get_save_state → game:save_state,",
    "and restoring dodi:init payload.savedState) and declare save_state.",
    "",
    SUCCESS_SYSTEM_TEMPLATE.trim(),
    "",
    "For a goal game, set progress_kind: goal, map the success definition onto",
    "success_criteria in game.md (standard metrics only), and report every required",
    "metric through state.dodi.metrics and game:progress messages.",
    "",
    GAME_CANVAS_TEMPLATE.trim(),
    "",
    designLanguageDoc(perspective).trim(),
    "",
    "## Structure",
    "- One HTML file, inline CSS and JS, filling the fixed game canvas exactly.",
    "- Touch-friendly: targets at least 44x44 px. Kid-safe, age-appropriate.",
    "- Modern JavaScript (ES2020+), error handling in bridge handlers.",
    "",
    TRANSLATIONS,
    "",
    "## Before you push",
    "Run `dodi games check <folder>` and fix every error. Look at the saved frames",
    "against the design language above. Write the briefing (game.md body).",
  ].join("\n");
}

export const DOC_TOPICS = [
  "start",
  "games",
  "format",
  "bridge",
  "commands",
  "success",
  "design",
  "translations",
  "check",
  "publish",
  "assets",
] as const;

export type DocTopic = (typeof DOC_TOPICS)[number];

export function renderDoc(topic: DocTopic, options: { perspective?: GamePerspective } = {}): string {
  switch (topic) {
    case "start":
      return START;
    case "games":
      return gamesGuide(options.perspective);
    case "format":
      return FORMAT;
    case "bridge":
      return BRIDGE_INTERFACE_TEMPLATE.trim();
    case "commands":
      return standardCommandsDoc().trim();
    case "success":
      return SUCCESS_SYSTEM_TEMPLATE.trim();
    case "design":
      return `${GAME_CANVAS_TEMPLATE.trim()}\n\n${designLanguageDoc(options.perspective).trim()}`;
    case "translations":
      return TRANSLATIONS;
    case "check":
      return CHECK;
    case "publish":
      return PUBLISH;
    case "assets":
      return ASSET_DOC;
  }
}
