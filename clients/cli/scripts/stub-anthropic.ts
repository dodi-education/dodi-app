/**
 * A stand-in for the Anthropic Messages API, for end-to-end runs that must
 * not call a real model (no cost, deterministic). Point the Anthropic SDK at
 * it with ANTHROPIC_BASE_URL. It plays three parts, chosen by the request:
 *
 *  - the plan agent (tools: propose_plan): proposes PLAN, then confirms;
 *  - the game agent (tools: write_game_code): writes GAME_HTML, then ends;
 *  - plain JSON requests (settings derivation, success mapping, anything
 *    else): answers with the JSON the request asks for.
 *
 * Streaming requests get Server-Sent Events in the Messages API's format.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const PLAN =
  "**Goal**\n- Count dinosaurs from 1 to 10\n\n**How it plays**\n- Dinosaurs appear; tap the number that matches";

export const GAME_HTML = `<!doctype html>
<html><head><meta charset="utf-8" />
<script type="application/dodi-translations">
{"sourceLocale":"en","locales":{"en":{"game.title":"Dino count","score.label":"{count} dinos"}}}
</script>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:sans-serif;background:#fdf6e3}#t{text-align:center;padding-top:40%}</style>
</head><body><div id="t"></div>
<script>
(function(){var token=null,state={score:0};
function send(type,payload){if(token)parent.postMessage({type:type,token:token,payload:payload},"*")}
window.addEventListener("message",function(e){var m=e.data||{};
if(m.type==="dodi:init"){token=m.token;document.getElementById("t").textContent=dodi.translate("game.title")+" "+dodi.translate("score.label",{count:state.score});send("game:ready",{capabilities:["save_state"],state:state});}
else if(m.token!==token){return}
else if(m.type==="dodi:command"){send("game:result",{command:m.payload&&m.payload.command,result:{ok:false,error:"unknown"},state:state})}
else if(m.type==="dodi:get_state"){send("game:state",state)}
else if(m.type==="dodi:get_save_state"){send("game:save_state",{state:state})}});})();
</script></body></html>`;

interface Block {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface RequestBody {
  stream?: boolean;
  system?: unknown;
  tools?: Array<{ name: string }>;
  messages: Array<{ role: string; content: unknown }>;
}

let toolCount = 0;

function hasToolResult(body: RequestBody): boolean {
  const last = body.messages[body.messages.length - 1];
  return Array.isArray(last?.content) && last.content.some((c: { type?: string }) => c?.type === "tool_result");
}

function systemText(body: RequestBody): string {
  if (typeof body.system === "string") return body.system;
  if (Array.isArray(body.system)) return body.system.map((b: { text?: string }) => b.text ?? "").join("\n");
  return "";
}

/** What the stand-in model answers. */
function reply(body: RequestBody): { content: Block[]; stop: "end_turn" | "tool_use" } {
  const tools = new Set((body.tools ?? []).map((t) => t.name));
  if (tools.has("propose_plan")) {
    if (hasToolResult(body)) return { content: [{ type: "text", text: "That's the plan. Shall I build it?" }], stop: "end_turn" };
    return {
      content: [
        { type: "text", text: "Here is a plan for you." },
        { type: "tool_use", id: `toolu_${++toolCount}`, name: "propose_plan", input: { summary: PLAN } },
      ],
      stop: "tool_use",
    };
  }
  if (tools.has("write_game_code")) {
    if (hasToolResult(body)) return { content: [{ type: "text", text: "The game is ready." }], stop: "end_turn" };
    return {
      content: [
        {
          type: "tool_use",
          id: `toolu_${++toolCount}`,
          name: "write_game_code",
          input: {
            code: GAME_HTML,
            markdown: "## Game Overview\nCount the dinosaurs.",
            title: "Dino Count",
            description: "Count dinosaurs from 1 to 10.",
            tags: ["math"],
            progressKind: "open",
            capabilities: ["save_state"],
            changeSummary: "- Built a dinosaur counting game",
          },
        },
      ],
      stop: "tool_use",
    };
  }
  const system = systemText(body);
  if (system.includes("You translate the text of a children's learning game")) {
    return { content: [{ type: "text", text: JSON.stringify(translation(body)) }], stop: "end_turn" };
  }
  if (system.includes("settings form")) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Dino Count",
            learningGoal: "Count from 1 to 10.",
            successDefinition: "",
            tags: ["math"],
            targetAgeMin: 4,
            targetAgeMax: 7,
            perspective: "side",
          }),
        },
      ],
      stop: "end_turn",
    };
  }
  if (system.includes("progressKind")) {
    return {
      content: [{ type: "text", text: JSON.stringify({ progressKind: "open", successCriteria: { description: "", match: "all", conditions: [], requiredMetrics: [] } }) }],
      stop: "end_turn",
    };
  }
  return { content: [{ type: "text", text: "{}" }], stop: "end_turn" };
}

/** The text of the last user message. */
function lastUserText(body: RequestBody): string {
  const last = [...body.messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return Array.isArray(last.content) ? last.content.map((c: { text?: string }) => c.text ?? "").join("\n") : "";
}

/** A translation answer for every requested locale (the source strings, tagged with the locale). */
function translation(body: RequestBody): { locales: Record<string, unknown> } {
  const prompt = lastUserText(body);
  const strings = JSON.parse(/## Source strings\n([\s\S]*?)\n\n## /.exec(prompt)?.[1] ?? "{}") as Record<string, string>;
  const targets = (/## Translate into: (.*)/.exec(prompt)?.[1] ?? "").split(",").map((l) => l.trim()).filter((l) => l && l !== "(none)");
  const listingOnly = (/## Listing only[^:]*: (.*)/.exec(prompt)?.[1] ?? "").split(",").map((l) => l.trim()).filter(Boolean);
  const locales: Record<string, unknown> = {};
  for (const locale of targets) {
    locales[locale] = {
      title: `Dino Count (${locale})`,
      description: `Count dinosaurs (${locale}).`,
      strings: Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, `${value} [${locale}]`])),
    };
  }
  for (const locale of listingOnly) locales[locale] = { title: `Dino Count (${locale})`, description: `Count dinosaurs (${locale}).` };
  return { locales };
}

const usage = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

function sse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...(data as object) })}\n\n`);
}

function streamReply(res: ServerResponse, content: Block[], stop: string): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  sse(res, "message_start", {
    message: { id: "msg_stub", type: "message", role: "assistant", model: "stub", content: [], stop_reason: null, stop_sequence: null, usage },
  });
  content.forEach((block, index) => {
    if (block.type === "text") {
      sse(res, "content_block_start", { index, content_block: { type: "text", text: "" } });
      sse(res, "content_block_delta", { index, delta: { type: "text_delta", text: block.text } });
    } else {
      sse(res, "content_block_start", { index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
      sse(res, "content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    sse(res, "content_block_stop", { index });
  });
  sse(res, "message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 10 } });
  sse(res, "message_stop", {});
  res.end();
}

async function readBody(req: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

export interface StubServer {
  url: string;
  /** How many requests each part answered. */
  calls: { plan: number; game: number; other: number };
  close(): Promise<void>;
}

export async function startStubAnthropic(): Promise<StubServer> {
  const calls = { plan: 0, game: 0, other: 0 };
  const server = createServer(async (req, res) => {
    if (process.env.STUB_DEBUG) console.log(`    [stub] ${req.method} ${req.url}`);
    if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
      res.writeHead(404).end();
      return;
    }
    const body = JSON.parse(await readBody(req)) as RequestBody;
    const tools = new Set((body.tools ?? []).map((t) => t.name));
    if (tools.has("propose_plan")) calls.plan++;
    else if (tools.has("write_game_code")) calls.game++;
    else calls.other++;
    const { content, stop } = reply(body);
    if (process.env.STUB_DEBUG) {
      console.log(`    [stub] stream=${Boolean(body.stream)} tools=${[...tools].join(",") || "-"} -> ${stop} ${content.map((b) => b.name ?? b.type).join(",")}`);
    }
    if (body.stream) {
      streamReply(res, content, stop);
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "msg_stub", type: "message", role: "assistant", model: "stub", content, stop_reason: stop, stop_sequence: null, usage }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
