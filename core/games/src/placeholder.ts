/**
 * A freshly created parent-studio game starts as a sandbox-safe placeholder
 * until Dodi builds it. The placeholder carries a stable marker so we can tell
 * "not built yet" from a real build without a separate lifecycle column —
 * replacing the old `metadata.status === "draft"` signal.
 */
export const UNBUILT_MARKER = "dodi:unbuilt";

/** Minimal sandbox-safe stub for a game that hasn't been built with Dodi yet. */
export const UNBUILT_GAME_PLACEHOLDER = `<!doctype html>
<html>
<head><meta charset="utf-8" /><style>html,body{height:100%;margin:0}</style></head>
<body style="font-family:system-ui,sans-serif">
  <!-- ${UNBUILT_MARKER} -->
  <div style="display:flex;height:100%;align-items:center;justify-content:center;text-align:center;color:#61758C;padding:24px">
    <div>
      <div style="font-size:16px;font-weight:700;color:#22384E">Not built yet</div>
      <div style="font-size:13px;margin-top:6px">Describe this game to Dodi to build it.</div>
    </div>
  </div>
  <script>
    window.addEventListener("message", function (e) {
      var d = e.data;
      if (d && d.type === "dodi:init") {
        parent.postMessage({ type: "game:ready", token: d.token, payload: { capabilities: [], state: {} } }, "*");
      }
    });
  </script>
</body>
</html>`;

/** Whether a stored bundle is still the unbuilt placeholder (Dodi hasn't built it). */
export function isUnbuiltBundle(code: string): boolean {
  return code.includes(UNBUILT_MARKER);
}
