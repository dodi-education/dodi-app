/**
 * The CLI's device identity. `dodi login` creates a fresh ML-KEM + ML-DSA
 * keypair and keeps the secret halves in credentials.json (mode 0600, inside a
 * 0700 directory): they unwrap the family's vault key and sign the platform's
 * token challenges. An agent access key (DODI_TOKEN or `login --token`) stands
 * for the same thing in 60 characters: the keys are derived from its seed.
 */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { fromBase64Url, toBase64Url, type DeviceKeyPairs } from "@dodi/crypto";
import { agentKeyPairs, parseAgentAccessKey } from "@dodi/protocol/agent-key";

import { apiUrl, appUrl, credentialsPath } from "./config";
import { CliError, EXIT } from "./output";

export interface StoredCredentials {
  version: 1;
  apiUrl: string;
  appUrl: string;
  deviceId: string;
  name: string;
  /** pending until the parent approves; active after the first token. */
  status: "pending" | "active";
  pairingCode?: string;
  kemPublicKey: string;
  kemSecretKey: string;
  signPublicKey: string;
  signSecretKey: string;
}

export interface Identity {
  apiUrl: string;
  appUrl: string;
  deviceId: string;
  keys: DeviceKeyPairs;
  /** Where it came from, for `whoami`. */
  source: "login" | "access-key";
  stored?: StoredCredentials;
}

export function toStored(
  base: Pick<StoredCredentials, "apiUrl" | "appUrl" | "deviceId" | "name" | "status" | "pairingCode">,
  keys: DeviceKeyPairs,
): StoredCredentials {
  return {
    version: 1,
    ...base,
    kemPublicKey: toBase64Url(keys.kem.publicKey),
    kemSecretKey: toBase64Url(keys.kem.secretKey),
    signPublicKey: toBase64Url(keys.sign.publicKey),
    signSecretKey: toBase64Url(keys.sign.secretKey),
  };
}

export async function loadStoredCredentials(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoredCredentials | null> {
  try {
    const raw = JSON.parse(await readFile(credentialsPath(env), "utf8")) as StoredCredentials;
    return raw?.version === 1 && raw.deviceId ? raw : null;
  } catch {
    return null;
  }
}

export async function saveStoredCredentials(
  creds: StoredCredentials,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const file = credentialsPath(env);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

export async function clearStoredCredentials(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await rm(credentialsPath(env), { force: true });
}

function keysFromStored(creds: StoredCredentials): DeviceKeyPairs {
  return {
    kem: { publicKey: fromBase64Url(creds.kemPublicKey), secretKey: fromBase64Url(creds.kemSecretKey) },
    sign: { publicKey: fromBase64Url(creds.signPublicKey), secretKey: fromBase64Url(creds.signSecretKey) },
  };
}

/** Identity from an access key string. */
export function identityFromAccessKey(raw: string, env: NodeJS.ProcessEnv = process.env): Identity {
  const key = parseAgentAccessKey(raw);
  if (!key) {
    throw new CliError("That is not a dodi access key", EXIT.usage, "Access keys start with dodi_ak_.");
  }
  return {
    apiUrl: apiUrl(undefined, env),
    appUrl: appUrl(undefined, env),
    deviceId: key.deviceId,
    keys: agentKeyPairs(key),
    source: "access-key",
  };
}

/** The identity to act as: DODI_TOKEN first, then the stored login. */
export async function resolveIdentity(env: NodeJS.ProcessEnv = process.env): Promise<Identity> {
  if (env.DODI_TOKEN) return identityFromAccessKey(env.DODI_TOKEN, env);
  const stored = await loadStoredCredentials(env);
  if (!stored) {
    throw new CliError(
      "Not connected to dodi",
      EXIT.unauthorized,
      "Run `dodi login` and have the parent approve the link it prints.",
    );
  }
  if (stored.status === "pending") {
    throw new CliError(
      "Still waiting for the parent to approve this agent",
      EXIT.pending,
      "Ask the parent to open the approval link, then run `dodi login --resume`.",
    );
  }
  return {
    apiUrl: apiUrl(stored.apiUrl, env),
    appUrl: appUrl(stored.appUrl, env),
    deviceId: stored.deviceId,
    keys: keysFromStored(stored),
    source: "login",
    stored,
  };
}

export { keysFromStored };
