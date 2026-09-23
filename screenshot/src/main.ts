/**
 * Entrypoint: `pnpm --filter @dodi/screenshot start` (or `dev` for a watcher).
 * Boots the renderer lazily (Chromium launches on the first render) and shuts
 * it down cleanly on SIGTERM/SIGINT so the container stops fast.
 */

import { loadConfig } from "./config";
import { createRenderer } from "./renderer";
import { createServer } from "./server";

const config = loadConfig();
const renderer = createRenderer({
  maxConcurrent: config.maxConcurrentRenders,
  renderTimeoutMs: config.renderTimeoutMs,
  readyTimeoutMs: config.readyTimeoutMs,
  chromiumSandbox: config.chromiumSandbox,
});
const server = createServer({ renderer, config });

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      event: "listening",
      port: config.port,
      auth: config.secret ? "secret" : "open",
      allowedOrigins: config.allowedOrigins,
      maxConcurrentRenders: config.maxConcurrentRenders,
    }),
  );
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ t: new Date().toISOString(), event: "shutdown", signal }));
  server.close();
  await renderer.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
