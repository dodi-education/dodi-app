/**
 * Access: everything that can open the family vault (authorized_clients).
 *
 *  - Browsers and the app register themselves once they hold a vault wrap
 *    (`watchClientRegistration`), so they show up and can be revoked.
 *  - A robot or an agent (the dodi CLI) pairs: it prints a code, the parent
 *    opens /authorize?code=…, sees who asks (name, fingerprint and, for an
 *    agent, the scopes) and allows it with the account password. Allowing
 *    wraps the in-memory vault key to the client's KEM key (client-side) and
 *    activates it; the server never sees the vault key.
 *  - Revoking is one server call: wrap, status and login session together.
 *  - Access keys: the browser pairs and allows a seed-derived agent itself and
 *    shows the key once (see @dodi/protocol/agent-key).
 */
import { randomBytes, toBase64Url } from "@dodi/crypto";
import { agentKeyPairs, deviceFingerprint, formatAgentAccessKey } from "@dodi/protocol/agent-key";
import {
  AGENT_EXPIRY_DAYS,
  SENSITIVE_AGENT_SCOPES,
  normalizeAgentScopes,
  type AgentScope,
} from "@dodi/protocol/agent-scopes";
import type { AuthorizedClientKind, AuthorizedClientStatus } from "@dodi/types/database";
import type { DeviceKeystore } from "@dodi/vault";
import type { StoreApi } from "zustand/vanilla";

import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

export interface AccessDeps {
  api: PlatformApi;
  vault: VaultStore;
}

/** One entry of the Access list (mirrors the platform's AuthorizedClientView). */
export interface AuthorizedClientView {
  id: string;
  kind: AuthorizedClientKind;
  status: AuthorizedClientStatus;
  name: string | null;
  label: string | null;
  scopes: string[];
  expires_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  has_vault_access: boolean;
  is_current: boolean;
}

/** The Access screen's sections. */
export interface AccessGroups {
  current: AuthorizedClientView | null;
  browsersAndApps: AuthorizedClientView[];
  robots: AuthorizedClientView[];
  agents: AuthorizedClientView[];
}

/** A claimed robot or agent waiting for the parent's decision. */
export interface AccessRequest {
  id: string;
  deviceId: string;
  kemPublicKey: string;
  kind: "robot" | "agent";
  name: string | null;
  fingerprint: string;
  /** Agents only. */
  requestedScopes: AgentScope[];
}

export interface AgentGrant {
  scopes: readonly AgentScope[];
  /** null = never expires. */
  expiresInDays: number | null;
}

export type AccessRequestError = "not_found" | "rate_limited" | "failed";
export type AllowOutcome = "ok" | "wrong_password" | "rate_limited" | "failed";

/** The header that tells the list which client is asking (marks `is_current`). */
export const CURRENT_DEVICE_HEADER = "x-dodi-device-id";

// ----- Reading ---------------------------------------------------------------

/** The Access list; [] when it can't load. */
export async function loadAuthorizedClients(
  api: PlatformApi,
  currentDeviceId?: string | null,
): Promise<AuthorizedClientView[]> {
  try {
    const res = await api.request("/api/authorized-clients", {
      headers: currentDeviceId ? { [CURRENT_DEVICE_HEADER]: currentDeviceId } : {},
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { clients?: AuthorizedClientView[] };
    return data.clients ?? [];
  } catch {
    return [];
  }
}

/** Split the list into the Access screen's sections (current first, then by kind). */
export function groupAccess(clients: readonly AuthorizedClientView[]): AccessGroups {
  const current = clients.find((c) => c.is_current) ?? null;
  const others = clients.filter((c) => c !== current);
  return {
    current,
    browsersAndApps: others.filter((c) => c.kind === "browser" || c.kind === "app"),
    robots: others.filter((c) => c.kind === "robot"),
    agents: others.filter((c) => c.kind === "agent"),
  };
}

// ----- Pairing (robot, agent) --------------------------------------------------

/**
 * Look up a pairing code. Claiming binds the pending client to this account
 * (still inactive, with no vault access) so the parent can see what it is and
 * asks for before deciding.
 */
export async function claimAccessRequest(
  deps: Pick<AccessDeps, "api">,
  pairingCode: string,
): Promise<AccessRequest | AccessRequestError> {
  const code = pairingCode.trim();
  if (!code) return "not_found";
  try {
    const res = await deps.api.request("/api/authorized-clients/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode: code }),
    });
    if (res.status === 429) return "rate_limited";
    if (!res.ok) return "not_found";
    const claimed = (await res.json()) as {
      id: string;
      deviceId: string;
      kemPublicKey: string;
      signPublicKey: string;
      name: string | null;
      kind: string;
      requestedScopes: unknown;
    };
    if (claimed.kind !== "agent" && claimed.kind !== "robot") return "failed";
    return {
      id: claimed.id,
      deviceId: claimed.deviceId,
      kemPublicKey: claimed.kemPublicKey,
      kind: claimed.kind,
      name: claimed.name,
      fingerprint: deviceFingerprint(claimed.signPublicKey),
      requestedScopes: claimed.kind === "agent" ? normalizeAgentScopes(claimed.requestedScopes) : [],
    };
  } catch {
    return "failed";
  }
}

/**
 * Allow a claimed robot or agent: wrap the vault to it, then activate it with
 * the account password (re-authentication) and, for an agent, the grant. A
 * failed activation drops the wrap again.
 */
export async function allowAccessRequest(
  deps: AccessDeps,
  request: Pick<AccessRequest, "id" | "deviceId" | "kemPublicKey" | "kind">,
  input: { password: string; grant?: AgentGrant },
): Promise<AllowOutcome> {
  try {
    await deps.vault.getState().addDevice({
      deviceId: request.deviceId,
      deviceKemPublicKey: request.kemPublicKey,
    });
    const res = await deps.api.request(`/api/authorized-clients/${request.id}/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: input.password,
        ...(request.kind === "agent" && input.grant
          ? { scopes: input.grant.scopes, expiresInDays: input.grant.expiresInDays }
          : {}),
      }),
    });
    if (res.ok) return "ok";
    await deps.vault.getState().removeDevice(request.deviceId);
    if (res.status === 429) return "rate_limited";
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    return body.code === "WRONG_PASSWORD" ? "wrong_password" : "failed";
  } catch {
    return "failed";
  }
}

/** Decline a claimed request: it never got a vault wrap, so the row just goes. */
export async function declineAccessRequest(
  deps: Pick<AccessDeps, "api">,
  request: Pick<AccessRequest, "id">,
): Promise<boolean> {
  return (await revokeAccess(deps, request)).ok;
}

// ----- Revoking --------------------------------------------------------------------

/**
 * Revoke an entry of the Access list in one server step (wrap, status, login
 * session). `wasCurrent` = this very client lost access: the caller signs out.
 */
export async function revokeAccess(
  deps: Pick<AccessDeps, "api">,
  client: Pick<AuthorizedClientView, "id">,
): Promise<{ ok: boolean; wasCurrent: boolean }> {
  try {
    const res = await deps.api.request(`/api/authorized-clients/${client.id}`, { method: "DELETE" });
    if (!res.ok) return { ok: false, wasCurrent: false };
    const body = (await res.json().catch(() => ({}))) as { wasCurrent?: boolean };
    return { ok: true, wasCurrent: body.wasCurrent === true };
  } catch {
    return { ok: false, wasCurrent: false };
  }
}

// ----- Access keys ------------------------------------------------------------------

/** Hex device id: base64url could contain "_", which the access-key format uses as a separator. */
function newDeviceId(): string {
  return Array.from(randomBytes(12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Create an agent access key: derive an agent from a fresh seed, wrap the
 * vault to it, then create it already active in one call (the parent is
 * creating it themselves in the unlocked parent area, so there is no request
 * to approve and no password). Returns the key to show once; a failure drops
 * the wrap again. The seed never leaves this client.
 */
export async function createAgentAccessKey(
  deps: AccessDeps,
  input: { name: string } & AgentGrant,
): Promise<{ key: string } | { error: "rate_limited" | "failed" }> {
  const seed = randomBytes(32);
  const deviceId = newDeviceId();
  const keys = agentKeyPairs({ deviceId, seed });
  const kemPublicKey = toBase64Url(keys.kem.publicKey);
  try {
    await deps.vault.getState().addDevice({ deviceId, deviceKemPublicKey: kemPublicKey });
  } catch {
    return { error: "failed" };
  }
  try {
    const res = await deps.api.request("/api/authorized-clients/access-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId,
        kemPublicKey,
        signPublicKey: toBase64Url(keys.sign.publicKey),
        name: input.name,
        scopes: input.scopes,
        expiresInDays: input.expiresInDays,
      }),
    });
    if (res.ok) return { key: formatAgentAccessKey({ deviceId, seed }) };
    await deps.vault.getState().removeDevice(deviceId).catch(() => {});
    return { error: res.status === 429 ? "rate_limited" : "failed" };
  } catch {
    await deps.vault.getState().removeDevice(deviceId).catch(() => {});
    return { error: "failed" };
  }
}

// ----- Registering this client -----------------------------------------------------------

/** How a browser or the app describes itself in the Access list. */
export interface ClientIdentity {
  kind: "browser" | "app";
  /** Coarse, non-identifying ("Firefox on Linux"); see @dodi/protocol/client-label. */
  label: string | null;
}

/**
 * Register this browser or app whenever the vault unlocks (it holds a wrap
 * from then on), so it appears under Access and can be revoked. Best effort:
 * a failure only means the entry shows up on the next unlock. Returns the
 * unsubscribe function.
 */
export function watchClientRegistration(deps: {
  api: PlatformApi;
  vault: StoreApi<VaultState>;
  deviceKeystore: DeviceKeystore;
  describe: () => ClientIdentity;
}): () => void {
  let isRegistered = false;
  return deps.vault.subscribe((state, previous) => {
    if (state.status !== "unlocked") {
      if (state.status === "locked" || state.status === "idle") isRegistered = false;
      return;
    }
    if (previous.status === "unlocked" || isRegistered) return;
    isRegistered = true;
    void (async () => {
      try {
        const device = await deps.deviceKeystore.load();
        if (!device) return;
        const identity = deps.describe();
        const res = await deps.api.request("/api/authorized-clients/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deviceId: device.deviceId,
            kemPublicKey: toBase64Url(device.kem.publicKey),
            kind: identity.kind,
            label: identity.label,
          }),
        });
        if (!res.ok) isRegistered = false;
      } catch {
        isRegistered = false;
      }
    })();
  });
}

// ----- Display helpers (shared by web and mobile) -------------------------------------------

/** Message keys (under `access`) for each agent scope. */
export const AGENT_SCOPE_LABEL_KEYS: Record<AgentScope, { title: string; desc: string }> = {
  games: { title: "scopeGames", desc: "scopeGamesDesc" },
  "games:publish": { title: "scopeGamesPublish", desc: "scopeGamesPublishDesc" },
  "kids:basic": { title: "scopeKidsBasic", desc: "scopeKidsBasicDesc" },
  "kids:memory": { title: "scopeKidsMemory", desc: "scopeKidsMemoryDesc" },
  assets: { title: "scopeAssets", desc: "scopeAssetsDesc" },
  "assets:publish": { title: "scopeAssetsPublish", desc: "scopeAssetsPublishDesc" },
};

/** The prompt a parent pastes into their agent to get started. */
export const AGENT_STARTER_PROMPT =
  "Build a learning game for my kid on dodi.app with the dodi CLI (needs Node 20+). " +
  "Install it with `npm install -g @dodi-education/cli`, " +
  "run `dodi login` and send me the link it prints so I can allow access, " +
  "then read `dodi docs` and follow it.";

/** The approval card's starting toggles: everything requested except the sensitive scopes. */
export function initialAgentScopes(requested: readonly AgentScope[]): AgentScope[] {
  return requested.filter((scope) => !SENSITIVE_AGENT_SCOPES.includes(scope));
}

/** Expiry choices offered to the parent, in days; null = never expires. */
export const AGENT_EXPIRY_CHOICES: readonly (number | null)[] = [...AGENT_EXPIRY_DAYS, null];

export type ClientStatusKey = "statusActive" | "statusPending" | "statusExpired" | "statusSignedInOnly";

/** The `access` message key for an entry's status. */
export function clientStatusKey(
  client: Pick<AuthorizedClientView, "status" | "expires_at" | "has_vault_access">,
  now: number = Date.now(),
): ClientStatusKey {
  if (client.expires_at && Date.parse(client.expires_at) <= now) return "statusExpired";
  if (client.status === "pending") return "statusPending";
  return client.has_vault_access ? "statusActive" : "statusSignedInOnly";
}

/** The `access` message key for each kind. */
export const CLIENT_KIND_KEYS: Record<AuthorizedClientKind, string> = {
  browser: "kindBrowser",
  app: "kindApp",
  robot: "kindRobot",
  agent: "kindAgent",
};

/** The `access` message keys for claim and allow failures. */
export const ACCESS_REQUEST_ERROR_KEYS: Record<AccessRequestError, string> = {
  not_found: "errorNotFound",
  rate_limited: "errorRateLimited",
  failed: "errorFailed",
};
export const ALLOW_ERROR_KEYS: Record<Exclude<AllowOutcome, "ok">, string> = {
  wrong_password: "errorWrongPassword",
  rate_limited: "errorRateLimited",
  failed: "errorAllowFailed",
};

/** The name to show for an entry: an agent's or robot's name, a browser's label. */
export function clientDisplayName(client: Pick<AuthorizedClientView, "name" | "label">): string | null {
  return client.name ?? client.label;
}
