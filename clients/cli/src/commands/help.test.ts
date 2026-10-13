import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateDeviceKeyPairs } from "@dodi/crypto";
import { AGENT_SCOPES } from "@dodi/protocol/agent-scopes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadStoredCredentials, saveStoredCredentials, toStored } from "../lib/credentials";
import { createOutput, EXIT } from "../lib/output";
import { COMMANDS } from "./registry";

/**
 * `--help` / `-h` anywhere in a command prints that command's usage and exits
 * 0, and does nothing else: no network call, no build, and `dodi logout
 * --help` must not disconnect the agent.
 */

const SUBCOMMANDS: Record<string, string[]> = {
  studio: ["new", "plan", "build", "send", "wait", "show", "stop", "resume", "open", "settings", "activate"],
  games: ["list", "pull", "push", "publish", "status"],
  assets: ["new", "check", "push", "list", "pull", "publish", "status"],
};

const CASES: Array<[string, string[]]> = Object.keys(COMMANDS).flatMap((name) => [
  [name, ["--help"]],
  [name, ["-h"]],
  ...(SUBCOMMANDS[name] ?? []).flatMap((sub): Array<[string, string[]]> => [
    [name, [sub, "--help"]],
    [name, [sub, "-h"]],
  ]),
]);

let stdout: string;
let fetchCalls: number;

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dodi-help-"));
  vi.stubEnv("DODI_CONFIG_DIR", dir);
  vi.stubEnv("DODI_API_URL", "http://127.0.0.1:9");
  vi.stubEnv("DODI_TOKEN", "");
  await saveStoredCredentials(
    toStored({ apiUrl: "http://127.0.0.1:9", appUrl: "http://127.0.0.1:9", deviceId: "d1", name: "agent", status: "active" }, generateDeviceKeyPairs()),
  );
  stdout = "";
  fetchCalls = 0;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.stubGlobal("fetch", async () => {
    fetchCalls++;
    throw new Error("no network in help");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("--help", () => {
  it.each(CASES)("dodi %s %j prints the usage and does nothing else", async (name, argv) => {
    const code = await COMMANDS[name].run(argv, createOutput(false)).catch((error: { exitCode?: number }) => error.exitCode ?? EXIT.error);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toContain(`dodi ${name}`);
    expect(fetchCalls).toBe(0);
    expect(await loadStoredCredentials()).not.toBeNull();
  });

  it("lists every scope and --force in the login usage", async () => {
    await COMMANDS.login.run(["--help"], createOutput(false));
    for (const scope of AGENT_SCOPES) expect(stdout).toContain(scope);
    expect(stdout).toContain("--force");
  });
});
