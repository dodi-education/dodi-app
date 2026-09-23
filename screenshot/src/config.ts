/**
 * Worker configuration from the environment. Every value has a default so a
 * bare `pnpm --filter @dodi/screenshot dev` works; production sets them in
 * dodi-com/ops/hosting/env/screenshot.env (see README.md).
 */

export interface WorkerConfig {
  port: number;
  /** Required in `x-screenshot-secret` when set; unset ⇒ open (private network). */
  secret: string | null;
  /** Origins allowed to call /render from a browser (custom-service mode). */
  allowedOrigins: string[];
  /** Renders in flight at once; the queue holds twice that, then 429. */
  maxConcurrentRenders: number;
  /** Hard deadline per render, including queue-free time. */
  renderTimeoutMs: number;
  /** How long a game gets to answer dodi:init with game:ready. */
  readyTimeoutMs: number;
  /** Run Chromium without its own sandbox (containers without user namespaces). */
  chromiumSandbox: boolean;
}

function intOr(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const secret = env.SCREENSHOT_SERVICE_SECRET?.trim() ?? "";
  return {
    port: intOr(env.PORT, 3006),
    secret: secret || null,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    maxConcurrentRenders: intOr(env.MAX_CONCURRENT_RENDERS, 2),
    renderTimeoutMs: intOr(env.RENDER_TIMEOUT_MS, 20_000),
    readyTimeoutMs: intOr(env.READY_TIMEOUT_MS, 5_000),
    chromiumSandbox: env.CHROMIUM_SANDBOX === "1",
  };
}
