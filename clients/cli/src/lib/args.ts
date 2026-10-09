/** Thin wrapper over node:util parseArgs with errors that read like usage help. */
import { parseArgs, type ParseArgsConfig } from "node:util";

type ParseArgsOptionsConfig = NonNullable<ParseArgsConfig["options"]>;

import { CliError, EXIT } from "./output";

export interface ParsedArgs {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
  /** A string option (undefined when absent). */
  str(name: string): string | undefined;
  /** A boolean flag. */
  flag(name: string): boolean;
}

export function parse(argv: string[], options: ParseArgsOptionsConfig, usage: string): ParsedArgs {
  let parsed: { values: Record<string, unknown>; positionals: string[] };
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true }) as typeof parsed;
  } catch (error) {
    throw new CliError((error as Error).message, EXIT.usage, usage);
  }
  const values = parsed.values as ParsedArgs["values"];
  return {
    values,
    positionals: parsed.positionals,
    str: (name) => (typeof values[name] === "string" ? (values[name] as string) : undefined),
    flag: (name) => values[name] === true,
  };
}

export function requirePositional(positionals: string[], index: number, name: string, usage: string): string {
  const value = positionals[index];
  if (!value) throw new CliError(`Missing <${name}>`, EXIT.usage, usage);
  return value;
}
