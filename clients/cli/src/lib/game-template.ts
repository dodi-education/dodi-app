/**
 * What `dodi games new` writes: a tiny but complete game that already passes
 * `dodi games check` (bridge handshake, commands, save/restore, translations
 * in every platform language), so an agent starts from something that works
 * and replaces it rather than guessing the protocol.
 */
import type { GameMeta } from "./game-project";

export const STARTER_GAME_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script type="application/dodi-translations">
{"sourceLocale":"en","locales":{"en":{"game.title":"Catch the stars","game.hint":"Tap the star!","score.label":"{count} stars"},"de":{"game.title":"Fang die Sterne","game.hint":"Tippe auf den Stern!","score.label":"{count} Sterne"}}}
</script>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body { font-family: system-ui, sans-serif; background: #fdf6e3; color: #24324a; }
  #root { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 6% 0; box-sizing: border-box; }
  h1 { margin: 0; font-size: 7cqw; }
  #stage { position: relative; width: 90%; flex: 1; margin: 4% 0; container-type: size; }
  #star { position: absolute; width: 18%; aspect-ratio: 1; min-width: 44px; border: 0; padding: 0; background: none; cursor: pointer; }
  #star svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 4px 0 #e0a800); }
  #score { font-size: 6cqw; font-weight: 700; }
</style>
</head>
<body>
<div id="root" style="container-type: inline-size">
  <h1 id="title"></h1>
  <div id="stage"><button id="star" aria-label=""><svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,5 61,38 96,38 68,59 78,93 50,72 22,93 32,59 4,38 39,38" fill="#ffd23f" stroke="#f5b700" stroke-width="4" stroke-linejoin="round"/></svg></button></div>
  <div id="score"></div>
</div>
<script>
(function () {
  var token = null;
  var state = { score: 0, x: 40, y: 40 };
  var CAPABILITIES = ["save_state"];

  function send(type, payload) {
    if (!token) return;
    parent.postMessage({ type: type, token: token, payload: payload }, "*");
  }
  function render() {
    document.getElementById("title").textContent = dodi.translate("game.title");
    document.getElementById("score").textContent = dodi.translate("score.label", { count: state.score });
    var star = document.getElementById("star");
    star.setAttribute("aria-label", dodi.translate("game.hint"));
    star.style.left = state.x + "%";
    star.style.top = state.y + "%";
  }
  function moveStar() {
    state.x = Math.round(Math.random() * 75);
    state.y = Math.round(Math.random() * 75);
  }

  document.getElementById("star").addEventListener("click", function () {
    state.score += 1;
    moveStar();
    render();
    send("game:state", state);
  });

  window.addEventListener("message", function (event) {
    var msg = event.data || {};
    if (msg.type === "dodi:init") {
      token = msg.token;
      var saved = msg.payload && msg.payload.savedState;
      if (saved && typeof saved.score === "number") state = saved;
      render();
      send("game:ready", { capabilities: CAPABILITIES, state: state });
    } else if (msg.token !== token) {
      return;
    } else if (msg.type === "dodi:command") {
      var command = msg.payload && msg.payload.command;
      send("game:result", { command: command, result: { ok: false, error: "unknown command" }, state: state });
    } else if (msg.type === "dodi:get_state") {
      send("game:state", state);
    } else if (msg.type === "dodi:get_save_state") {
      send("game:save_state", { state: state });
    }
  });
})();
</script>
</body>
</html>
`;

export function starterMeta(title: string): GameMeta {
  return {
    title,
    description: "Tap the star to catch it. A starting point to replace with your own game.",
    audience: "family",
    is_active: false,
    age_min: 3,
    age_max: 6,
    duration_minutes: 5,
    tags: [],
    progress_kind: "open",
    capabilities: ["save_state"],
    learning_goal: "",
    success_definition: "",
    listing: {
      en: { title: "Catch the stars", description: "Tap the star to catch it." },
      de: { title: "Fang die Sterne", description: "Tippe auf den Stern, um ihn zu fangen." },
    },
  };
}

export const STARTER_BRIEFING = `## Game Overview
A star appears somewhere on the screen. Tapping it scores a point and the star jumps elsewhere.

## Rules
No winning or losing: every tap on the star is one more star caught.

## Available Commands
None besides saving and restoring.

## State Fields
- score: stars caught so far
- x, y: the star's position in percent of the play area

## Teaching Strategy
Cheer each catch and count along with the kid.`;

export const AGENTS_MD = `# Building a dodi game

This folder is a dodi game. Read \`dodi docs games\` (the full guide) and
\`dodi docs format\` (game.md fields) before changing anything.

Loop until it is right:
1. Edit game.html and game.md.
2. \`dodi games check .\` and fix every error; look at .dodi/check/*.jpg.
3. \`dodi games push .\` uploads it to the family library (sealed on this machine).

Set is_active: true in game.md when the kids should see it.
`;
