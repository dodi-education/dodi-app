/**
 * dodi mcp: the CLI as a local MCP server over stdio (JSON-RPC 2.0), for
 * agents that prefer tools to shell commands. Every tool runs the same
 * command as the shell with --json, so both paths behave identically; stdout
 * carries only protocol messages.
 */
import { createInterface } from "node:readline";

import { DEFAULT_AGENT_SCOPES } from "@dodi/protocol/agent-scopes";

import { DOC_TOPICS } from "../lib/docs";
import { CliError, EXIT, type Output } from "../lib/output";
import { CLI_VERSION } from "../version";
import { COMMANDS } from "./registry";

const PROTOCOL_VERSION = "2025-06-18";

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The CLI argv this call runs. */
  argv: (input: Record<string, unknown>) => string[];
}

const str = (description: string) => ({ type: "string", description });
const folder = str("Path to the game folder");

const flag = (on: unknown, name: string): string[] => (on === true ? [name] : []);
const opt = (value: unknown, name: string): string[] => (typeof value === "string" && value ? [name, value] : []);

export const TOOLS: ToolDef[] = [
  {
    name: "dodi_login",
    description:
      "Connect this machine to a dodi family. Returns an approval link for the parent; if still pending, call again with resume: true after they approved.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Agent name shown to the parent"),
        scopes: str(`Comma-separated scopes (default ${DEFAULT_AGENT_SCOPES.join(",")})`),
        resume: { type: "boolean", description: "Keep waiting for a pending approval" },
        wait_seconds: { type: "number", description: "How long to wait for approval (default 20)" },
      },
    },
    argv: (i) => [
      "login",
      ...(i.resume === true ? ["--resume"] : [...opt(i.name, "--name"), ...opt(i.scopes, "--scopes")]),
      "--wait",
      String(typeof i.wait_seconds === "number" ? i.wait_seconds : 20),
    ],
  },
  { name: "dodi_whoami", description: "Show this connection's family, scopes and expiry.", inputSchema: { type: "object", properties: {} }, argv: () => ["whoami"] },
  {
    name: "dodi_docs",
    description: "Read the dodi authoring docs. Start with topic 'start', then 'games' before writing a game.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", enum: [...DOC_TOPICS] },
        perspective: { type: "string", enum: ["bird", "side", "isometric"] },
      },
    },
    argv: (i) => ["docs", ...(typeof i.topic === "string" ? [i.topic] : []), ...opt(i.perspective, "--perspective")],
  },
  {
    name: "dodi_kids",
    description: "List the family's kids (names/ages only with kids:basic), or one kid's memory dossier (kids:memory).",
    inputSchema: { type: "object", properties: { memory_kid_id: str("Return this kid's memory dossier instead") } },
    argv: (i) => ["kids", ...opt(i.memory_kid_id, "--memory")],
  },
  { name: "dodi_games_list", description: "List the family's games.", inputSchema: { type: "object", properties: {} }, argv: () => ["games", "list"] },
  {
    name: "dodi_games_new",
    description: "Scaffold a working starter game in a new folder.",
    inputSchema: { type: "object", properties: { folder, title: str("Game title") }, required: ["folder"] },
    argv: (i) => ["games", "new", String(i.folder), ...opt(i.title, "--title")],
  },
  {
    name: "dodi_games_pull",
    description: "Download a family game into a folder to edit or remix it.",
    inputSchema: { type: "object", properties: { game_id: str("Game id"), folder }, required: ["game_id"] },
    argv: (i) => ["games", "pull", String(i.game_id), ...(typeof i.folder === "string" ? [i.folder] : [])],
  },
  {
    name: "dodi_games_check",
    description: "Validate and run the game headlessly: errors, warnings, runtime errors, layout issues and screenshot files.",
    inputSchema: {
      type: "object",
      properties: {
        folder,
        runtime: { type: "string", enum: ["auto", "local", "service", "static"], description: "Where to run it (default auto)" },
        locale: str("Language to render"),
      },
      required: ["folder"],
    },
    argv: (i) => [
      "games",
      "check",
      String(i.folder),
      ...(i.runtime === "local" ? ["--local"] : i.runtime === "service" ? ["--service"] : i.runtime === "static" ? ["--static"] : []),
      ...opt(i.locale, "--locale"),
    ],
  },
  {
    name: "dodi_games_push",
    description: "Seal and upload the game to the family library (creates or updates).",
    inputSchema: { type: "object", properties: { folder, force: { type: "boolean", description: "Upload despite check errors" } }, required: ["folder"] },
    argv: (i) => ["games", "push", String(i.folder), ...flag(i.force, "--force")],
  },
  {
    name: "dodi_games_publish",
    description: "Submit the pushed game to dodi Discover (reviewed before it goes live).",
    inputSchema: { type: "object", properties: { folder }, required: ["folder"] },
    argv: (i) => ["games", "publish", String(i.folder)],
  },
  {
    name: "dodi_games_status",
    description: "Discover review status of a pushed game.",
    inputSchema: { type: "object", properties: { folder }, required: ["folder"] },
    argv: (i) => ["games", "status", String(i.folder)],
  },
  {
    name: "dodi_assets_new",
    description: "Scaffold a custom companion avatar or accessory folder.",
    inputSchema: {
      type: "object",
      properties: { folder, kind: { type: "string", enum: ["avatar", "accessory"] }, name: str("Asset name") },
      required: ["folder", "kind"],
    },
    argv: (i) => ["assets", "new", String(i.folder), "--kind", String(i.kind), ...opt(i.name, "--name")],
  },
  {
    name: "dodi_assets_check",
    description: "Validate an asset folder's asset.glb against the dodi character format.",
    inputSchema: { type: "object", properties: { folder }, required: ["folder"] },
    argv: (i) => ["assets", "check", String(i.folder)],
  },
  {
    name: "dodi_assets_push",
    description: "Seal and upload a custom avatar or accessory (creates or updates).",
    inputSchema: { type: "object", properties: { folder }, required: ["folder"] },
    argv: (i) => ["assets", "push", String(i.folder)],
  },
  { name: "dodi_assets_list", description: "List the family's custom avatars and accessories.", inputSchema: { type: "object", properties: {} }, argv: () => ["assets", "list"] },
  {
    name: "dodi_assets_publish",
    description: "Share a pushed avatar or accessory on dodi Discover (a person reviews it first). Uses preview.png from the folder if present.",
    inputSchema: { type: "object", properties: { folder }, required: ["folder"] },
    argv: (i) => ["assets", "publish", String(i.folder)],
  },
  {
    name: "dodi_assets_status",
    description: "Discover review status of a pushed avatar or accessory.",
    inputSchema: { type: "object", properties: { folder }, required: ["folder"] },
    argv: (i) => ["assets", "status", String(i.folder)],
  },
];

/** Collects a command's result instead of printing it. */
function captureOutput(): Output & { value: unknown; notes: string[] } {
  const capture = {
    json: true,
    value: undefined as unknown,
    notes: [] as string[],
    info(line: string) {
      capture.notes.push(line);
    },
    result(value: unknown) {
      capture.value = value;
    },
  };
  return capture;
}

export async function callTool(name: string, input: Record<string, unknown>) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new CliError(`Unknown tool ${name}`, EXIT.usage);
  const [command, ...rest] = tool.argv(input);
  const out = captureOutput();
  try {
    const code = await COMMANDS[command].run(rest, out);
    const body = { exitCode: code, result: out.value ?? null, ...(out.notes.length ? { notes: out.notes.join("\n") } : {}) };
    return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: false };
  } catch (error) {
    const cli = error instanceof CliError ? error : null;
    const body = {
      exitCode: cli?.exitCode ?? EXIT.error,
      error: error instanceof Error ? error.message : String(error),
      hint: cli?.hint ?? null,
      ...(out.notes.length ? { notes: out.notes.join("\n") } : {}),
    };
    return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true };
  }
}

type JsonRpcId = string | number | null;

export async function handleMessage(message: {
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
  const { id, method, params } = message;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
  if (id === undefined) return null; // notifications (initialized, cancelled) need no answer
  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "dodi", version: CLI_VERSION },
        instructions:
          "Build learning games and companion looks for a dodi family. Start with dodi_docs (topic start), connect with dodi_login, read dodi_docs topic games before writing a game, and loop dodi_games_check until it reports ok before dodi_games_push.",
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const name = String(params?.name ?? "");
      const input = (params?.arguments ?? {}) as Record<string, unknown>;
      return reply(await callTool(name, input));
    }
    default:
      return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

export async function runMcp(): Promise<number> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message: Parameters<typeof handleMessage>[0];
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      continue;
    }
    const response = await handleMessage(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
  return EXIT.ok;
}
