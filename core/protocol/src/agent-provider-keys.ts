/**
 * The provider keys an agent with the `studio` scope builds with.
 *
 * A family's provider keys live in one sealed blob (accounts.encrypted_api_keys)
 * that the server cannot split. So when a parent allows an agent to "build with
 * your AI providers", their browser opens the blob, picks only the keys of the
 * providers configured for game building, images and thinking (never voice),
 * and seals that subset to the agent's own ML-KEM key, exactly like the vault
 * key handover. The server stores the sealed bundle and can't read it; the
 * agent opens it with its device key. A key changed later makes the copy stale
 * until the parent allows the agent again.
 */
import {
  bytesToUtf8,
  fromBase64Url,
  unwrapKeyWithDevice,
  utf8ToBytes,
  wrapKeyForDevice,
  type KemWrappedKey,
} from "@dodi/crypto";
import type { AccountModelConfig, AIProviderId } from "@dodi/types/ai";

export interface AgentProviderKeys {
  v: 1;
  /** Plaintext keys by provider (only on the parent's and the agent's device). */
  keys: Partial<Record<AIProviderId, string>>;
}

/** The categories a studio build uses. Voice never: an agent doesn't talk to the kids. */
const BUILD_CATEGORIES = ["gameProvider", "imageProvider", "thinkingProvider"] as const;

/** Which providers an agent would build with, from the account's model config ("dodi" excluded). */
export function agentBuildProviders(config: Partial<AccountModelConfig> | null): AIProviderId[] {
  const ids = BUILD_CATEGORIES.map((category) => config?.[category]).filter(
    (id): id is AIProviderId => typeof id === "string" && id !== "dodi",
  );
  return [...new Set(ids)];
}

/** The subset of the family's keys an agent gets: only the build providers that have a key. */
export function selectAgentProviderKeys(
  config: Partial<AccountModelConfig> | null,
  keys: Partial<Record<AIProviderId, string>>,
): AgentProviderKeys {
  const selected: Partial<Record<AIProviderId, string>> = {};
  for (const id of agentBuildProviders(config)) {
    const key = keys[id];
    if (key) selected[id] = key;
  }
  return { v: 1, keys: selected };
}

/** Seal the subset to the agent's ML-KEM public key (base64url); returns the stored string. */
export function sealAgentProviderKeys(agentKemPublicKey: string, bundle: AgentProviderKeys): string {
  return JSON.stringify(wrapKeyForDevice(fromBase64Url(agentKemPublicKey), utf8ToBytes(JSON.stringify(bundle))));
}

/** Open the bundle with the agent's ML-KEM secret key. Throws when it isn't one. */
export function openAgentProviderKeys(sealed: string, agentKemSecretKey: Uint8Array): AgentProviderKeys {
  const wrapped = JSON.parse(sealed) as KemWrappedKey;
  const parsed = JSON.parse(bytesToUtf8(unwrapKeyWithDevice(agentKemSecretKey, wrapped))) as AgentProviderKeys;
  if (parsed?.v !== 1 || typeof parsed.keys !== "object" || parsed.keys === null) {
    throw new Error("Not an agent provider key bundle");
  }
  return parsed;
}
