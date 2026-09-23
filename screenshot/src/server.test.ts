import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkerConfig } from "./config";
import { RenderBusyError, RenderTimeoutError } from "./renderer";
import { createServer, MAX_BODY_BYTES } from "./server";

const FRAME = "data:image/jpeg;base64,RlJBTUU=";
const REPLY = { version: 1, frames: [{ label: "initial", image: FRAME }], ready: true, warnings: [], errors: [] };
const VALID = { version: 1, document: "<html><body>game</body></html>" };

const BASE_CONFIG: WorkerConfig = {
  port: 0,
  secret: null,
  allowedOrigins: [],
  maxConcurrentRenders: 1,
  renderTimeoutMs: 1000,
  readyTimeoutMs: 100,
  chromiumSandbox: false,
};

interface Booted {
  url: string;
  render: ReturnType<typeof vi.fn>;
  logs: Record<string, unknown>[];
  close: () => Promise<void>;
}

const booted: Booted[] = [];

async function boot(config: Partial<WorkerConfig> = {}, render = vi.fn().mockResolvedValue(REPLY)): Promise<Booted> {
  const logs: Record<string, unknown>[] = [];
  const server = createServer({
    renderer: { render },
    config: { ...BASE_CONFIG, ...config },
    log: (line) => logs.push(line),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const entry: Booted = {
    url: `http://127.0.0.1:${port}`,
    render,
    logs,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  booted.push(entry);
  return entry;
}

afterEach(async () => {
  await Promise.all(booted.splice(0).map((b) => b.close()));
});

function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${url}/render`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("screenshot worker HTTP surface", () => {
  it("answers the health check", async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "dodi-screenshot" });
  });

  it("renders a valid request and logs sizes, never the document", async () => {
    const { url, render, logs } = await boot();
    const res = await post(url, { ...VALID, steps: [{ label: "after a tap" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(REPLY);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ document: VALID.document }));
    const line = logs.find((l) => l.path === "/render");
    expect(line).toMatchObject({ status: 200, documentBytes: VALID.document.length, steps: 1, frames: 1, ready: true });
    expect(JSON.stringify(logs)).not.toContain(VALID.document);
  });

  it("404s unknown paths and 405s non-POST on /render", async () => {
    const { url } = await boot();
    expect((await fetch(`${url}/nope`)).status).toBe(404);
    expect((await fetch(`${url}/render`)).status).toBe(405);
  });

  it("requires the shared secret when one is configured", async () => {
    const { url, render } = await boot({ secret: "s3cret" });
    expect((await post(url, VALID)).status).toBe(401);
    expect((await post(url, VALID, { "x-screenshot-secret": "wrong" })).status).toBe(401);
    expect(render).not.toHaveBeenCalled();
    expect((await post(url, VALID, { "x-screenshot-secret": "s3cret" })).status).toBe(200);
  });

  it("is open when no secret is configured", async () => {
    const { url } = await boot({ secret: null });
    expect((await post(url, VALID)).status).toBe(200);
  });

  it("refuses oversized bodies by declared and by actual size", async () => {
    const { url, render } = await boot();
    const declared = await post(url, VALID, { "content-length": String(MAX_BODY_BYTES + 1) }).catch(() => null);
    // Node may reset the connection when the declared length is a lie; either
    // way the renderer never runs.
    if (declared) expect(declared.status).toBe(413);
    const huge = { version: 1, document: "x".repeat(MAX_BODY_BYTES + 10) };
    const res = await post(url, huge);
    expect(res.status).toBe(413);
    expect(render).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON and contract violations with 400", async () => {
    const { url, render } = await boot();
    expect((await post(url, "not json")).status).toBe(400);
    expect((await post(url, { version: 2, document: "x" })).status).toBe(400);
    expect((await post(url, { version: 1 })).status).toBe(400);
    expect(render).not.toHaveBeenCalled();
  });

  it("maps renderer failures: busy 429, timeout 504, anything else 500", async () => {
    const busy = await boot({}, vi.fn().mockRejectedValue(new RenderBusyError()));
    expect((await post(busy.url, VALID)).status).toBe(429);
    const slow = await boot({}, vi.fn().mockRejectedValue(new RenderTimeoutError(1000)));
    expect((await post(slow.url, VALID)).status).toBe(504);
    const broken = await boot({}, vi.fn().mockRejectedValue(new Error("chromium died")));
    expect((await post(broken.url, VALID)).status).toBe(500);
    expect(broken.logs.at(-1)).toMatchObject({ status: 500, error: "chromium died" });
  });

  it("grants CORS only to configured origins", async () => {
    const { url } = await boot({ allowedOrigins: ["https://app.test"] });
    const preflight = await fetch(`${url}/render`, {
      method: "OPTIONS",
      headers: { origin: "https://app.test", "access-control-request-method": "POST" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://app.test");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("x-screenshot-secret");

    const denied = await fetch(`${url}/render`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.test", "access-control-request-method": "POST" },
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    const res = await post(url, VALID, { origin: "https://app.test" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.test");
    const foreign = await post(url, VALID, { origin: "https://evil.test" });
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
  });
});
