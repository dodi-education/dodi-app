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
    description: "Read the dodi docs. Start with topic 'start', then 'studio' before your first brief.",
    inputSchema: { type: "object", properties: { topic: { type: "string", enum: [...DOC_TOPICS] } } },
    argv: (i) => ["docs", ...(typeof i.topic === "string" ? [i.topic] : [])],
  },
  {
    name: "dodi_kids",
    description: "List the family's kids (names and ages only with kids:basic), or one kid's memory (kids:memory).",
    inputSchema: { type: "object", properties: { memory_kid_id: str("Return this kid's memory instead") } },
    argv: (i) => ["kids", ...opt(i.memory_kid_id, "--memory")],
  },
  {
    name: "dodi_studio_new",
    description: "Start a new game: plan it with dodi's game agent from your brief. Returns dodi's reply and the plan.",
    inputSchema: { type: "object", properties: { brief: str("What to make, for whom, what they should learn"), kid_id: str("Make it for one kid instead of the family") }, required: ["brief"] },
    argv: (i) => ["studio", "new", String(i.brief), ...opt(i.kid_id, "--kid")],
  },
  {
    name: "dodi_studio_plan",
    description: "Keep planning the current game: answer dodi or ask for changes to the plan.",
    inputSchema: { type: "object", properties: { message: str("Your answer or change request") }, required: ["message"] },
    argv: (i) => ["studio", "plan", String(i.message)],
  },
  {
    name: "dodi_studio_build",
    description: "Accept the plan: dodi builds the game in the background. Follow it with dodi_studio_wait.",
    inputSchema: { type: "object", properties: { plan: str("Your edited version of the plan (optional)") } },
    argv: (i) => ["studio", "build", ...opt(i.plan, "--plan")],
  },
  {
    name: "dodi_studio_send",
    description: "A change round on the built game: dodi works in the background. Follow it with dodi_studio_wait.",
    inputSchema: {
      type: "object",
      properties: {
        feedback: str("One concrete change"),
        images: { type: "array", items: { type: "string" }, description: "Reference picture files (PNG or JPEG)" },
      },
      required: ["feedback"],
    },
    argv: (i) => [
      "studio",
      "send",
      String(i.feedback),
      ...(Array.isArray(i.images) ? i.images.flatMap((file) => ["--image", String(file)]) : []),
    ],
  },
  {
    name: "dodi_studio_wait",
    description: "Wait for the running build. Returns dodi's reply and the screenshot files to look at; exit code 3 means still building, call again.",
    inputSchema: { type: "object", properties: { timeout_seconds: { type: "number", description: "Default 110" } } },
    argv: (i) => ["studio", "wait", ...(typeof i.timeout_seconds === "number" ? ["--timeout", String(i.timeout_seconds)] : [])],
  },
  { name: "dodi_studio_show", description: "Where the current game stands: plan, last reply, build state.", inputSchema: { type: "object", properties: {} }, argv: () => ["studio", "show"] },
  { name: "dodi_studio_stop", description: "Stop the running build.", inputSchema: { type: "object", properties: {} }, argv: () => ["studio", "stop"] },
  { name: "dodi_studio_resume", description: "Continue an interrupted build.", inputSchema: { type: "object", properties: {} }, argv: () => ["studio", "resume"] },
  {
    name: "dodi_studio_open",
    description: "Work on another of the family's games (see dodi_games_list).",
    inputSchema: { type: "object", properties: { game_id: str("Game id") }, required: ["game_id"] },
    argv: (i) => ["studio", "open", String(i.game_id)],
  },
  {
    name: "dodi_studio_settings",
    description:
      "Show the current game's settings, or change the ones you pass. Change settings only when the parent asks; never switch on a picture the parent switched off. Takes effect from the next build.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Game title"),
        learning_goal: str("What the kid should learn"),
        success: str("How you'd know they learned it"),
        ages: str("Age range, e.g. 5-8"),
        perspective: { type: "string", enum: ["bird", "side", "isometric", "auto"] },
        preview_image: { type: "string", enum: ["on", "off"], description: "dodi draws the game-list preview picture" },
        background_image: { type: "string", enum: ["on", "off"], description: "dodi draws a background picture" },
      },
    },
    argv: (i) => [
      "studio",
      "settings",
      ...opt(i.title, "--title"),
      ...opt(i.learning_goal, "--learning-goal"),
      ...opt(i.success, "--success"),
      ...opt(i.ages, "--ages"),
      ...opt(i.perspective, "--perspective"),
      ...opt(i.preview_image, "--preview-image"),
      ...opt(i.background_image, "--background-image"),
    ],
  },
  {
    name: "dodi_studio_activate",
    description: "Let the kids play the current game. Only when the parent asked for it.",
    inputSchema: { type: "object", properties: {} },
    argv: () => ["studio", "activate"],
  },
  { name: "dodi_games_list", description: "List the family's games.", inputSchema: { type: "object", properties: {} }, argv: () => ["games", "list"] },
  {
    name: "dodi_games_publish",
    description: "Submit a game to dodi Discover (translated into every language, then reviewed). Only when the parent asked for it.",
    inputSchema: { type: "object", properties: { game_id: str("Game id (default: the current studio game)") } },
    argv: (i) => ["games", "publish", ...(typeof i.game_id === "string" ? [i.game_id] : [])],
  },
  {
    name: "dodi_games_status",
    description: "Discover review status of a game.",
    inputSchema: { type: "object", properties: { game_id: str("Game id (default: the current studio game)") } },
    argv: (i) => ["games", "status", ...(typeof i.game_id === "string" ? [i.game_id] : [])],
  },
  {
    name: "dodi_assets_new",
    description: "Scaffold a custom companion avatar or accessory folder.",
    inputSchema: {
      type: "object",
      properties: { folder: str("Path to the asset folder"), kind: { type: "string", enum: ["avatar", "accessory"] }, name: str("Asset name") },
      required: ["folder", "kind"],
    },
    argv: (i) => ["assets", "new", String(i.folder), "--kind", String(i.kind), ...opt(i.name, "--name")],
  },
  {
    name: "dodi_assets_check",
    description: "Validate an asset folder's asset.glb against the dodi character format.",
    inputSchema: { type: "object", properties: { folder: str("Path to the asset folder") }, required: ["folder"] },
    argv: (i) => ["assets", "check", String(i.folder)],
  },
  {
    name: "dodi_assets_push",
    description: "Seal and upload a custom avatar or accessory (creates or updates).",
    inputSchema: { type: "object", properties: { folder: str("Path to the asset folder") }, required: ["folder"] },
    argv: (i) => ["assets", "push", String(i.folder)],
  },
  { name: "dodi_assets_list", description: "List the family's custom avatars and accessories.", inputSchema: { type: "object", properties: {} }, argv: () => ["assets", "list"] },
  {
    name: "dodi_assets_publish",
    description: "Share a pushed avatar or accessory on dodi Discover (a person reviews it first).",
    inputSchema: { type: "object", properties: { folder: str("Path to the asset folder") }, required: ["folder"] },
    argv: (i) => ["assets", "publish", String(i.folder)],
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
          "Make learning games for a dodi family by briefing dodi's own game agent, like a parent in Game Studio. Read dodi_docs (topic start, then studio), connect with dodi_login, then dodi_studio_new → dodi_studio_plan → dodi_studio_build → dodi_studio_wait → dodi_studio_send.",
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
