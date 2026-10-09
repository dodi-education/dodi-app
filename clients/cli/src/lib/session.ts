/**
 * A connected session: an authenticated platform client plus the unlocked
 * vault. The device signs a platform challenge with its ML-DSA key to get a
 * short-lived bearer (cached until shortly before it runs out), fetches its
 * own vault wrap and opens it with its ML-KEM key. Everything the CLI writes
 * is sealed here, on the agent's machine, before it is sent.
 */
import { sign, toBase64Url, utf8ToBytes } from "@dodi/crypto";
import { DodiClient } from "@dodi/protocol/client";
import { VaultSession, unlockVaultWithDevice } from "@dodi/vault";

import { resolveIdentity, type Identity } from "./credentials";
import { CliError, EXIT } from "./output";

/** Bearers live 15 minutes; refresh a minute early. */
const TOKEN_REFRESH_MS = 14 * 60 * 1000;

export interface Connection {
  identity: Identity;
  client: DodiClient;
  vault: VaultSession;
  /** JSON request helper that turns HTTP failures into CliErrors. */
  api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

async function postJson(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Challenge → sign → bearer. Returns null while the device isn't active yet
 * (pending approval), throws on anything else.
 */
export async function requestDeviceToken(identity: Pick<Identity, "apiUrl" | "deviceId" | "keys">): Promise<string | null> {
  let res: Response;
  try {
    res = await postJson(identity.apiUrl, "/api/authorized-clients/challenge", { deviceId: identity.deviceId });
  } catch (error) {
    throw new CliError(
      `Cannot reach ${identity.apiUrl}: ${(error as Error).message}`,
      EXIT.error,
      "Check the network, or set DODI_API_URL for a self-hosted dodi.",
    );
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new CliError(`Challenge failed (${res.status})`);
  const { nonce } = (await res.json()) as { nonce: string };
  const signature = toBase64Url(sign(identity.keys.sign.secretKey, utf8ToBytes(nonce)));
  const tokenRes = await postJson(identity.apiUrl, "/api/authorized-clients/token", {
    deviceId: identity.deviceId,
    nonce,
    signature,
  });
  if (tokenRes.status === 404) return null;
  if (!tokenRes.ok) throw new CliError(`Token request failed (${tokenRes.status})`);
  return ((await tokenRes.json()) as { token: string }).token;
}

export function tokenProvider(identity: Identity): () => Promise<string> {
  let cached: { token: string; at: number } | null = null;
  return async () => {
    if (cached && Date.now() - cached.at < TOKEN_REFRESH_MS) return cached.token;
    const token = await requestDeviceToken(identity);
    if (!token) {
      throw new CliError(
        "This agent connection was revoked, has expired or is not approved yet",
        EXIT.unauthorized,
        "Run `dodi login` again and have the parent approve it.",
      );
    }
    cached = { token, at: Date.now() };
    return token;
  };
}

async function errorFrom(res: Response, path: string): Promise<CliError> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) detail = body.error;
  } catch {
    // not JSON
  }
  if (res.status === 401) {
    return new CliError(detail || "Not authorized", EXIT.unauthorized, "Run `dodi login` again.");
  }
  if (res.status === 403) {
    return new CliError(
      detail || "This agent may not do that",
      EXIT.forbidden,
      "The parent can grant more in Settings > Access (reconnect with `dodi login --scopes …`).",
    );
  }
  return new CliError(`${path} failed (${res.status})${detail ? `: ${detail}` : ""}`);
}

export async function unlockVault(client: DodiClient, identity: Identity): Promise<VaultSession> {
  const keys = await client.getVaultKeys();
  if (!keys) throw new CliError("This family has no vault yet", EXIT.error, "Finish setup in the dodi app first.");
  try {
    return new VaultSession(unlockVaultWithDevice(keys, identity.deviceId, identity.keys.kem.secretKey));
  } catch {
    throw new CliError(
      "This agent can no longer open the family vault",
      EXIT.unauthorized,
      "The connection was revoked. Run `dodi login` again.",
    );
  }
}

export function connectionFor(identity: Identity, client: DodiClient, vault: VaultSession): Connection {
  return {
    identity,
    client,
    vault,
    async api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
      const res = await client.request(path, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        ...(init.body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) }),
      });
      if (!res.ok) throw await errorFrom(res, path);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
  };
}

/** Connect as the stored (or DODI_TOKEN) identity and unlock the vault. */
export async function connect(env: NodeJS.ProcessEnv = process.env): Promise<Connection> {
  const identity = await resolveIdentity(env);
  const client = new DodiClient({
    baseUrl: identity.apiUrl,
    auth: { kind: "bearer", getToken: tokenProvider(identity) },
  });
  const vault = await unlockVault(client, identity);
  return connectionFor(identity, client, vault);
}

