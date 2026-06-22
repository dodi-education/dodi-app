/**
 * Structured server-side logger for Dodi.
 *
 * Writes NDJSON (one JSON object per line) to daily log files at
 * `logs/dodi-YYYY-MM-DD.log`. In development, also mirrors to console.
 *
 * Controlled by DODI_LOG_LEVEL env var:
 *   debug | info | warn | error | none
 *   Default: "debug" in development, "none" in production.
 */

import fs from "fs";
import path from "path";

import type { Logger, LogLevel } from "@dodi/types/logger";

// This fs-backed logger is the platform's concrete implementation of the
// shared @dodi/types Logger interface (the agent supplies its own).

// ---------------------------------------------------------------------------
// Level ordering
// ---------------------------------------------------------------------------

const LEVELS: Record<LogLevel | "none", number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

function getConfiguredLevel(): LogLevel | "none" {
  const env = process.env.DODI_LOG_LEVEL?.toLowerCase();
  if (env && env in LEVELS) return env as LogLevel | "none";
  return process.env.NODE_ENV === "production" ? "none" : "debug";
}

// ---------------------------------------------------------------------------
// Redaction — strip sensitive fields
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "key",
  "secret",
  "token",
  "authorization",
  "password",
]);

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// File output — daily log files
// ---------------------------------------------------------------------------

const LOG_DIR = path.resolve(process.cwd(), "logs");

/** Ensure the logs/ directory exists (created once per process). */
let logDirReady = false;
function ensureLogDir(): void {
  if (logDirReady) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    logDirReady = true;
  } catch {
    // If we can't create the dir, we'll fall back to console only
  }
}

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `dodi-${date}.log`);
}

function writeToFile(line: string): boolean {
  ensureLogDir();
  try {
    fs.appendFileSync(getLogFilePath(), line + "\n");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Console methods by level
// ---------------------------------------------------------------------------

const CONSOLE_METHOD: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.log,
  warn: console.warn,
  error: console.error,
};

// ---------------------------------------------------------------------------
// Core emit
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV !== "production";

function emit(
  level: LogLevel,
  scope: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  const configuredLevel = getConfiguredLevel();
  if (LEVELS[level] < LEVELS[configuredLevel]) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    event,
    ...(data ? redact(data) : {}),
  };

  const line = JSON.stringify(entry);

  // Always write to file
  const written = writeToFile(line);

  // In dev, also mirror to console. If file write failed, always console.
  if (isDev || !written) {
    CONSOLE_METHOD[level](line);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createLogger(scope: string): Logger {
  return {
    debug(event, data) {
      emit("debug", scope, event, data);
    },
    info(event, data) {
      emit("info", scope, event, data);
    },
    warn(event, data) {
      emit("warn", scope, event, data);
    },
    error(event, data) {
      emit("error", scope, event, data);
    },
    time(event) {
      const start = Date.now();
      return (data?: Record<string, unknown>) => {
        emit("info", scope, event, { ...data, durationMs: Date.now() - start });
      };
    },
  };
}
