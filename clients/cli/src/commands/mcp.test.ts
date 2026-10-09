import { describe, expect, it } from "vitest";

import { handleMessage, TOOLS } from "./mcp";

describe("dodi mcp", () => {
  it("initializes and lists every tool", async () => {
    const init = await handleMessage({ id: 1, method: "initialize", params: {} });
    expect((init?.result as { serverInfo: { name: string } }).serverInfo.name).toBe("dodi");
    const list = await handleMessage({ id: 2, method: "tools/list" });
    const names = (list?.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toEqual(TOOLS.map((t) => t.name));
  });

  it("ignores notifications and rejects unknown methods", async () => {
    expect(await handleMessage({ method: "notifications/initialized" })).toBeNull();
    const unknown = await handleMessage({ id: 3, method: "resources/list" });
    expect((unknown?.error as { code: number }).code).toBe(-32601);
  });

  it("runs a tool through the same command as the shell", async () => {
    const res = await handleMessage({ id: 4, method: "tools/call", params: { name: "dodi_docs", arguments: { topic: "publish" } } });
    const result = res?.result as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text).result.markdown).toMatch(/Discover/);
  });

  it("reports a failing tool as an error with its exit code", async () => {
    const res = await handleMessage({ id: 5, method: "tools/call", params: { name: "dodi_docs", arguments: { topic: "nope" } } });
    const result = res?.result as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).exitCode).toBe(2);
  });

  it("maps tool input onto CLI arguments", () => {
    const check = TOOLS.find((t) => t.name === "dodi_games_check")!;
    expect(check.argv({ folder: "g", runtime: "local", locale: "de" })).toEqual(["games", "check", "g", "--local", "--locale", "de"]);
    const login = TOOLS.find((t) => t.name === "dodi_login")!;
    expect(login.argv({ resume: true })).toEqual(["login", "--resume", "--wait", "20"]);
  });
});
