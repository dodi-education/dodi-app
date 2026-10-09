/**
 * dodi games dev: a live preview on localhost. The page hosts the game in the
 * same sandboxed iframe and sandbox document the apps use, does the bridge
 * handshake, reloads when game.html or game.md change, and relays every
 * bridge message and uncaught error to this terminal (and the page's log), so
 * an agent sees what the game does without a person watching.
 */
import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { createServer, type ServerResponse } from "node:http";

import { buildSandboxSrcDoc } from "@dodi/games/sandbox-doc";
import { SUPPORTED_LOCALES } from "@dodi/intl/locales";

import { parse } from "../lib/args";
import { checkStatic } from "../lib/game-check";
import { readGameProject } from "../lib/game-project";
import { CliError, EXIT, type Output } from "../lib/output";

const USAGE = "dodi games dev [<folder>] [--port <n>] [--locale <code>]";

/** Reports uncaught errors from inside the sandbox to the host page. */
const ERROR_RELAY = `<script>(function(){function r(m){try{parent.postMessage({type:"dev:error",payload:{error:String(m)}},"*")}catch(e){}}
window.addEventListener("error",function(e){r(e.message||e.error)});
window.addEventListener("unhandledrejection",function(e){r("unhandled rejection: "+(e.reason&&e.reason.message||e.reason))});
var ce=console.error;console.error=function(){r(Array.prototype.map.call(arguments,String).join(" "));return ce.apply(console,arguments)};})();</script>`;

function withErrorRelay(doc: string): string {
  const head = /<head[^>]*>/i.exec(doc);
  return head ? doc.replace(head[0], `${head[0]}${ERROR_RELAY}`) : `${ERROR_RELAY}${doc}`;
}

function hostPage(locale: string): string {
  const locales = SUPPORTED_LOCALES.map((l) => `<option${l === locale ? " selected" : ""}>${l}</option>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>dodi games dev</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#eef2f7;display:flex;gap:16px;padding:16px;box-sizing:border-box;height:100vh}
#stage{height:100%;aspect-ratio:4/5;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px #0002}
iframe{border:0;width:100%;height:100%;display:block}
#side{flex:1;display:flex;flex-direction:column;gap:8px;min-width:0}
#log{flex:1;overflow:auto;background:#0f172a;color:#cbd5e1;font:12px/1.5 ui-monospace,monospace;padding:8px;border-radius:8px;white-space:pre-wrap}
button,select{font:inherit;padding:6px 10px}
</style></head><body>
<div id="stage"><iframe id="game" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Game"></iframe></div>
<div id="side"><div>
<button id="restart">Restart</button> <button id="saveRestore">Save + restore</button> <button id="state">Get state</button>
<select id="locale">${locales}</select></div><div id="log"></div></div>
<script>
var frame=document.getElementById("game"),log=document.getElementById("log"),token=null,saved=null,retry=null,ready=false;
function line(t){log.textContent+=t+"\\n";log.scrollTop=log.scrollHeight}
function report(kind,data){fetch("/log",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:kind,data:data})}).catch(function(){})}
function post(m){frame.contentWindow&&frame.contentWindow.postMessage(m,"*")}
function start(savedState){
  token="dev-"+Math.random().toString(36).slice(2);ready=false;clearInterval(retry);
  fetch("/doc").then(function(r){return r.text()}).then(function(doc){
    frame.onload=function(){
      var init={type:"dodi:init",token:token,payload:{gameId:"dev",locale:document.getElementById("locale").value}};
      if(savedState)init.payload.savedState=savedState;
      retry=setInterval(function(){if(!ready)post(init)},300);post(init);
    };
    frame.srcdoc=doc;line("— loaded");report("loaded",{});
  });
}
window.addEventListener("message",function(e){
  if(e.source!==frame.contentWindow)return;var m=e.data||{};
  if(m.type==="game:ready"){ready=true;clearInterval(retry)}
  if(m.type==="game:save_state"&&saved==="pending"){saved=m.payload&&m.payload.state;line("— restoring saved state");start(saved);saved=null}
  line(m.type+" "+JSON.stringify(m.payload||{}).slice(0,400));report("message",m);
});
document.getElementById("restart").onclick=function(){start()};
document.getElementById("state").onclick=function(){post({type:"dodi:get_state",token:token})};
document.getElementById("saveRestore").onclick=function(){saved="pending";post({type:"dodi:get_save_state",token:token})};
document.getElementById("locale").onchange=function(){start()};
var es=new EventSource("/events");es.onmessage=function(){line("— files changed, reloading");start()};
start();
</script></body></html>`;
}

function summarize(message: { type?: string; payload?: Record<string, unknown> }): string {
  const payload = message.payload ?? {};
  switch (message.type) {
    case "game:ready":
      return `game:ready  capabilities=${JSON.stringify(payload.capabilities ?? [])}`;
    case "game:progress":
    case "game:event":
    case "game:result":
    case "game:error":
    case "dev:error":
      return `${message.type}  ${JSON.stringify(payload).slice(0, 300)}`;
    case "game:state":
      return `game:state  ${JSON.stringify(payload).slice(0, 200)}`;
    case "game:save_state":
      return `game:save_state  ${JSON.stringify(payload).length} chars`;
    default:
      return `${message.type ?? "?"}  ${JSON.stringify(payload).slice(0, 200)}`;
  }
}

export async function runDev(argv: string[], out: Output): Promise<number> {
  const args = parse(argv, { port: { type: "string" }, locale: { type: "string" } }, USAGE);
  const dir = args.positionals[0] ?? ".";
  const port = Number(args.str("port") ?? 4870);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CliError("--port must be 1 to 65535", EXIT.usage, USAGE);
  const locale = args.str("locale") ?? "en";
  const project = await readGameProject(dir);
  const listeners = new Set<ServerResponse>();
  const sessionId = randomUUID();

  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(hostPage(locale));
      } else if (req.url === "/doc") {
        const current = await readGameProject(project.dir);
        const result = checkStatic(current);
        for (const error of result.errors) out.info(`check: ${error}`);
        res
          .writeHead(200, { "content-type": "text/html; charset=utf-8" })
          .end(withErrorRelay(buildSandboxSrcDoc(result.sanitizedCode ?? current.code)));
      } else if (req.url === "/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(`data: hello ${sessionId}\n\n`);
        listeners.add(res);
        req.on("close", () => listeners.delete(res));
      } else if (req.url === "/log" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const entry = JSON.parse(body) as { kind: string; data: { type?: string; payload?: Record<string, unknown> } };
            if (entry.kind === "message") {
              out.result(entry.data, () => summarize(entry.data));
            } else {
              out.info(`— ${entry.kind}`);
            }
          } catch {
            // ignore malformed log lines
          }
          res.writeHead(204).end();
        });
      } else {
        res.writeHead(404).end();
      }
    } catch (error) {
      out.info(`error: ${(error as Error).message}`);
      res.writeHead(500).end();
    }
  });

  let timer: NodeJS.Timeout | undefined;
  watch(project.dir, (_event, file) => {
    if (!file || !/^(game\.html|game\.md)$/.test(String(file))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const res of listeners) res.write("data: reload\n\n");
    }, 150);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  out.info(`Previewing ${project.meta.title} at http://127.0.0.1:${port}  (Ctrl+C to stop)`);
  out.info("Bridge messages from the game appear below as it runs.");
  await new Promise<void>(() => {
    // Runs until interrupted.
  });
  return EXIT.ok;
}
