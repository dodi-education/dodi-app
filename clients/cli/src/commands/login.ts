/**
 * dodi login: pair this machine as an agent of a family.
 *
 * Creates a fresh device identity, enrolls it with the scopes it asks for and
 * prints an approval link for the parent. It then waits (default 90 s, short
 * enough for an agent's command timeout); if the parent hasn't approved yet
 * it exits with code 3 and `dodi login --resume` keeps waiting. With --token
 * it uses an access key the parent created in Settings > Access instead.
 */
import { hostname } from "node:os";

import { generateDeviceKeyPairs, randomBytes, toBase64Url } from "@dodi/crypto";
import { deviceFingerprint } from "@dodi/protocol/agent-key";
import { DEFAULT_AGENT_SCOPES, isAgentScope, type AgentScope } from "@dodi/protocol/agent-scopes";
import { DodiClient } from "@dodi/protocol/client";

import { parse } from "../lib/args";
import { apiUrl, appUrl, approvalUrl } from "../lib/config";
import {
  identityFromAccessKey,
  keysFromStored,
  loadStoredCredentials,
  saveStoredCredentials,
  toStored,
  type Identity,
  type StoredCredentials,
} from "../lib/credentials";
import { CliError, EXIT, type Output } from "../lib/output";
import { connectionFor, requestDeviceToken, tokenProvider, unlockVault } from "../lib/session";

const USAGE =
  "dodi login [--name <agent name>] [--scopes games,games:publish,kids:basic,kids:memory,assets,assets:publish] [--wait <seconds>] [--resume] [--token <dodi_ak_…>]";

const POLL_MS = 2_000;

/** A recognisable default name for the approval screen. */
export function defaultAgentName(env: NodeJS.ProcessEnv = process.env): string {
  const host = hostname().split(".")[0];
  if (env.CLAUDECODE) return `Claude Code on ${host}`;
  if (env.CURSOR_TRACE_ID || env.CURSOR_AGENT) return `Cursor on ${host}`;
  if (env.CODEX_HOME || env.CODEX_SANDBOX) return `Codex on ${host}`;
  return `dodi CLI on ${host}`;
}

export function parseScopes(raw: string | undefined): AgentScope[] {
  if (!raw) return [...DEFAULT_AGENT_SCOPES];
  const scopes = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = scopes.filter((s) => !isAgentScope(s));
  if (unknown.length) {
    throw new CliError(`Unknown scope(s): ${unknown.join(", ")}`, EXIT.usage, USAGE);
  }
  return scopes as AgentScope[];
}

function identityOf(creds: StoredCredentials): Identity {
  return {
    apiUrl: creds.apiUrl,
    appUrl: creds.appUrl,
    deviceId: creds.deviceId,
    keys: keysFromStored(creds),
    source: "login",
    stored: creds,
  };
}

interface Connected {
  status: "connected";
  name: string | null;
  scopes: string[];
  expiresAt: string | null;
}

/** First token → verify the vault opens → describe the grant. */
async function finishConnect(identity: Identity): Promise<Connected> {
  const client = new DodiClient({ baseUrl: identity.apiUrl, auth: { kind: "bearer", getToken: tokenProvider(identity) } });
  const vault = await unlockVault(client, identity);
  const conn = connectionFor(identity, client, vault);
  const self = await conn.api<{ client: { name: string | null; scopes: string[]; expires_at: string | null } | null }>(
    "/api/authorized-clients/self",
  );
  return {
    status: "connected",
    name: self.client?.name ?? null,
    scopes: self.client?.scopes ?? [],
    expiresAt: self.client?.expires_at ?? null,
  };
}

async function waitForApproval(identity: Identity, seconds: number): Promise<boolean> {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    if (await requestDeviceToken(identity)) return true;
    if (Date.now() + POLL_MS > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function describeConnected(result: Connected): string {
  return [
    `Connected${result.name ? ` as "${result.name}"` : ""}.`,
    `Scopes: ${result.scopes.join(", ") || "none"}`,
    `Expires: ${result.expiresAt ?? "never"}`,
    "Next: `dodi docs` for the workflow, `dodi kids` for who you are building for.",
  ].join("\n");
}

export async function runLogin(argv: string[], out: Output, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const args = parse(
    argv,
    {
      name: { type: "string" },
      scopes: { type: "string" },
      wait: { type: "string" },
      resume: { type: "boolean" },
      token: { type: "string" },
      force: { type: "boolean" },
    },
    USAGE,
  );
  const wait = args.str("wait");
  const waitSeconds = wait === undefined ? 90 : Number(wait);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 900) {
    throw new CliError("--wait must be 0 to 900 seconds", EXIT.usage, USAGE);
  }

  // Access key: the parent already approved it in Settings.
  const token = args.str("token");
  if (token) {
    const identity = identityFromAccessKey(token, env);
    const result = await finishConnect(identity);
    await saveStoredCredentials(
      toStored({ apiUrl: identity.apiUrl, appUrl: identity.appUrl, deviceId: identity.deviceId, name: result.name ?? "access key", status: "active" }, identity.keys),
      env,
    );
    out.result(result, () => describeConnected(result));
    return EXIT.ok;
  }

  const existing = await loadStoredCredentials(env);

  if (args.flag("resume")) {
    if (!existing || existing.status !== "pending") {
      throw new CliError("There is no pending login to resume", EXIT.usage, "Run `dodi login`.");
    }
    return awaitAndFinish(existing, waitSeconds, out, env);
  }

  if (existing?.status === "active" && !args.flag("force")) {
    try {
      const result = await finishConnect(identityOf(existing));
      out.result({ ...result, alreadyConnected: true }, () => `Already connected. ${describeConnected(result)}\n(Use --force to pair again.)`);
      return EXIT.ok;
    } catch {
      out.info("The stored connection no longer works; pairing again.");
    }
  }

  const keys = generateDeviceKeyPairs();
  const deviceId = Array.from(randomBytes(12), (b) => b.toString(16).padStart(2, "0")).join("");
  const name = args.str("name")?.trim() || defaultAgentName(env);
  const scopes = parseScopes(args.str("scopes"));
  const api = apiUrl(undefined, env);
  const app = appUrl(undefined, env);

  let res: Response;
  try {
    res = await fetch(`${api}/api/authorized-clients/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId,
        kemPublicKey: toBase64Url(keys.kem.publicKey),
        signPublicKey: toBase64Url(keys.sign.publicKey),
        name,
        kind: "agent",
        scopes,
      }),
    });
  } catch (error) {
    throw new CliError(`Cannot reach ${api}: ${(error as Error).message}`, EXIT.error, "Set DODI_API_URL for a self-hosted dodi.");
  }
  if (!res.ok) throw new CliError(`Enrolling failed (${res.status})`);
  const { pairingCode } = (await res.json()) as { pairingCode: string };

  const creds = toStored({ apiUrl: api, appUrl: app, deviceId, name, status: "pending", pairingCode }, keys);
  await saveStoredCredentials(creds, env);
  return awaitAndFinish(creds, waitSeconds, out, env);
}

async function awaitAndFinish(
  creds: StoredCredentials,
  waitSeconds: number,
  out: Output,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const link = approvalUrl(creds.appUrl, creds.pairingCode ?? "");
  const fingerprint = deviceFingerprint(creds.signPublicKey);
  out.info(
    [
      "Ask the parent to open this link and approve the connection:",
      "",
      `  ${link}`,
      "",
      `  Code: ${creds.pairingCode}    Fingerprint: ${fingerprint}`,
      "",
      waitSeconds > 0 ? `Waiting up to ${waitSeconds} s for approval…` : "",
    ].join("\n"),
  );
  const identity = identityOf(creds);
  const approved = waitSeconds > 0 && (await waitForApproval(identity, waitSeconds));
  if (!approved) {
    out.result(
      { status: "pending", approvalUrl: link, code: creds.pairingCode, fingerprint },
      () => "Not approved yet. Once the parent approved, run `dodi login --resume`.",
    );
    return EXIT.pending;
  }
  const result = await finishConnect(identity);
  await saveStoredCredentials({ ...creds, status: "active", pairingCode: undefined }, env);
  out.result(result, () => describeConnected(result));
  return EXIT.ok;
}
