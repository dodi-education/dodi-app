/**
 * Injectable structured-logger interface shared across platform, web and the
 * agent. Concrete implementations (fs-backed for the server, console for the
 * agent, no-op for tests) live in their respective packages and are passed in
 * wherever a logger is needed — no module should import a concrete logger.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
  /** Returns a function that, when called, emits an info log with `durationMs`. */
  time(event: string): (data?: Record<string, unknown>) => void;
}

/** Factory signature implemented by concrete loggers, e.g. `createLogger(scope)`. */
export type CreateLogger = (scope: string) => Logger;
