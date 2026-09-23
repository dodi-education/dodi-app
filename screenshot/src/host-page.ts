/**
 * The page the worker loads around a game: one sandboxed iframe, sized to the
 * viewport, plus a relay that hands every message the game posts to the
 * Playwright side (`__onGameMessage`, exposed before the page is set) and a
 * `__postToGame` hook to send the bridge envelopes in. Same sandbox attributes
 * as the app's GameSandbox, so what the worker renders is what a child sees.
 */

export function buildHostPage(viewport: { width: number; height: number }): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
  iframe { border: 0; display: block; width: ${viewport.width}px; height: ${viewport.height}px; }
</style>
</head>
<body>
<iframe id="game" title="Game" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
<script>
(function () {
  var frame = document.getElementById('game');
  window.addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow) return;
    var json;
    try { json = JSON.stringify(e.data); } catch (err) { return; }
    if (typeof json !== 'string') return;
    if (typeof window.__onGameMessage === 'function') window.__onGameMessage(json);
  });
  window.__postToGame = function (msg) {
    if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, '*');
  };
  window.__loadGame = function (doc) {
    return new Promise(function (resolve) {
      frame.addEventListener('load', function () { resolve(); }, { once: true });
      frame.srcdoc = doc;
    });
  };
})();
</script>
</body>
</html>`;
}
