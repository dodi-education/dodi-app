/**
 * dodi: the command line for families' own AI agents. See `dodi docs`.
 */
import { runMcp } from "./commands/mcp";
import { COMMANDS } from "./commands/registry";
import { createOutput, EXIT, printError } from "./lib/output";
import { CLI_VERSION as VERSION } from "./version";


function help(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return [
    "dodi: let your AI agent build learning games and companion looks for your family.",
    "",
    "Usage: dodi <command> [options] [--json]",
    "",
    ...Object.entries(COMMANDS).map(([name, cmd]) => `  ${name.padEnd(width)}  ${cmd.summary}`),
    `  ${"mcp".padEnd(width)}  run as a local MCP server (stdio)`,
    "",
    "Start with `dodi docs`. Every command takes --json and exits with a meaningful code.",
  ].join("\n");
}

export async function main(argv: string[]): Promise<number> {
  const json = argv.includes("--json");
  const args = argv.filter((arg) => arg !== "--json");
  const [command, ...rest] = args;
  const out = createOutput(json);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    out.result({ commands: Object.keys(COMMANDS), version: VERSION }, help);
    return EXIT.ok;
  }
  if (command === "--version" || command === "-v") {
    out.result({ version: VERSION }, () => VERSION);
    return EXIT.ok;
  }
  if (command === "mcp") return runMcp();

  const entry = COMMANDS[command];
  if (!entry) {
    process.stderr.write(`Unknown command "${command}".\n\n${help()}\n`);
    return EXIT.usage;
  }
  try {
    return await entry.run(rest, out);
  } catch (error) {
    return printError(error, json);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.exitCode = printError(error, process.argv.includes("--json"));
  },
);
