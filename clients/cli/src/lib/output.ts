/**
 * Output and errors, written for agents first: every command can print one
 * JSON object (`--json`) and exits with a code that says what happened, so an
 * agent can branch on it without parsing prose.
 */

export const EXIT = {
  ok: 0,
  error: 1,
  usage: 2,
  /** `dodi login` is waiting for the parent's approval. */
  pending: 3,
  /** `dodi games check` found problems. */
  checkFailed: 4,
  /** Not connected, revoked or expired: run `dodi login`. */
  unauthorized: 5,
  /** The connection lacks a scope the command needs. */
  forbidden: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode = EXIT.error,
    /** What to do about it, one short sentence. */
    readonly hint?: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export interface Output {
  json: boolean;
  /** Human progress lines go to stderr, so stdout stays the result. */
  info(line: string): void;
  /** Print the command's result: JSON as-is, otherwise the human rendering. */
  result(value: unknown, human?: () => string): void;
}

export function createOutput(json: boolean): Output {
  return {
    json,
    info(line) {
      process.stderr.write(`${line}\n`);
    },
    result(value, human) {
      if (json || !human) {
        process.stdout.write(`${JSON.stringify(value, null, json ? 2 : 2)}\n`);
      } else {
        process.stdout.write(`${human()}\n`);
      }
    },
  };
}

export function printError(error: unknown, json: boolean): ExitCode {
  const cli = error instanceof CliError ? error : null;
  const message = error instanceof Error ? error.message : String(error);
  const code = cli?.exitCode ?? EXIT.error;
  if (json) {
    process.stdout.write(`${JSON.stringify({ error: message, hint: cli?.hint ?? null, exitCode: code }, null, 2)}\n`);
  } else {
    process.stderr.write(`error: ${message}\n`);
    if (cli?.hint) process.stderr.write(`hint: ${cli.hint}\n`);
  }
  return code;
}
