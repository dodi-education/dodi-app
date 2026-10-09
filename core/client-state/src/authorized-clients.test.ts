import { toBase64Url } from "@dodi/crypto";
import { agentKeyPairs, parseAgentAccessKey } from "@dodi/protocol/agent-key";
import { createDevice, type DeviceKeystore } from "@dodi/vault";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import {
  allowAccessRequest,
  claimAccessRequest,
  clientStatusKey,
  createAgentAccessKey,
  groupAccess,
  loadAuthorizedClients,
  revokeAccess,
  watchClientRegistration,
  type AuthorizedClientView,
} from "./authorized-clients";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

type Handler = (init: RequestInit | undefined) => Response;

function routedApi(routes: Record<string, Handler>) {
  const calls: Array<{ path: string; body: unknown; headers: Headers }> = [];
  const api: PlatformApi = {
    request: vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init?.headers),
      });
      const handler = routes[path];
      if (!handler) throw new Error(`unexpected ${path}`);
      return handler(init);
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  };
  return { api, calls };
}

function fakeVault() {
  const addDevice = vi.fn(async () => {});
  const removeDevice = vi.fn(async () => {});
  return {
    vault: createStore(() => ({ addDevice, removeDevice }) as unknown as VaultState) as VaultStore,
    addDevice,
    removeDevice,
  };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

const SIGN_PUB = toBase64Url(agentKeyPairs({ deviceId: "x", seed: new Uint8Array(32) }).sign.publicKey);
const CLAIMED_AGENT = {
  id: "row-1",
  deviceId: "dev-1",
  kemPublicKey: "kem",
  signPublicKey: SIGN_PUB,
  name: "Claude Code",
  kind: "agent",
  requestedScopes: ["games", "kids:memory", "nonsense"],
};

function view(patch: Partial<AuthorizedClientView>): AuthorizedClientView {
  return {
    id: "x",
    kind: "browser",
    status: "active",
    name: null,
    label: null,
    scopes: [],
    expires_at: null,
    last_seen_at: null,
    created_at: "2026-10-09T00:00:00Z",
    has_vault_access: true,
    is_current: false,
    ...patch,
  };
}

describe("Access", () => {
  it("loads the list, telling the platform which device asks", async () => {
    const { api, calls } = routedApi({ "/api/authorized-clients": json({ clients: [view({ id: "a" })] }) });
    expect((await loadAuthorizedClients(api, "dev-9")).map((c) => c.id)).toEqual(["a"]);
    expect(calls[0].headers.get("x-dodi-device-id")).toBe("dev-9");
    const failing = routedApi({ "/api/authorized-clients": json({}, 500) });
    expect(await loadAuthorizedClients(failing.api)).toEqual([]);
  });

  it("groups the list into the screen's sections", () => {
    const groups = groupAccess([
      view({ id: "me", is_current: true }),
      view({ id: "phone", kind: "app" }),
      view({ id: "bot", kind: "robot" }),
      view({ id: "cli", kind: "agent" }),
    ]);
    expect(groups.current?.id).toBe("me");
    expect(groups.browsersAndApps.map((c) => c.id)).toEqual(["phone"]);
    expect(groups.robots.map((c) => c.id)).toEqual(["bot"]);
    expect(groups.agents.map((c) => c.id)).toEqual(["cli"]);
  });

  it("reads statuses, including signed-in sessions without vault access", () => {
    expect(clientStatusKey(view({}))).toBe("statusActive");
    expect(clientStatusKey(view({ has_vault_access: false }))).toBe("statusSignedInOnly");
    expect(clientStatusKey(view({ status: "pending" }))).toBe("statusPending");
    expect(clientStatusKey(view({ expires_at: "2020-01-01T00:00:00Z" }))).toBe("statusExpired");
  });

  it("shows what a claimed agent asks for, with a fingerprint", async () => {
    const { api } = routedApi({ "/api/authorized-clients/claim": json(CLAIMED_AGENT) });
    const request = await claimAccessRequest({ api }, " KPLX-4821 ");
    expect(request).toMatchObject({ kind: "agent", name: "Claude Code", requestedScopes: ["games", "kids:memory"] });
    expect(typeof request === "object" && request.fingerprint).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("claims a robot without scopes", async () => {
    const { api } = routedApi({ "/api/authorized-clients/claim": json({ ...CLAIMED_AGENT, kind: "robot", requestedScopes: [] }) });
    expect(await claimAccessRequest({ api }, "x")).toMatchObject({ kind: "robot", requestedScopes: [] });
  });

  it("names why a code didn't work", async () => {
    expect(await claimAccessRequest({ api: routedApi({ "/api/authorized-clients/claim": json({}, 400) }).api }, "x")).toBe("not_found");
    expect(await claimAccessRequest({ api: routedApi({ "/api/authorized-clients/claim": json({}, 429) }).api }, "x")).toBe("rate_limited");
  });

  it("wraps the vault, then activates with the grant", async () => {
    const { vault, addDevice } = fakeVault();
    const { api, calls } = routedApi({ "/api/authorized-clients/row-1/activate": json({}) });
    const outcome = await allowAccessRequest({ api, vault }, { ...CLAIMED_AGENT, kind: "agent" }, {
      grant: { scopes: ["games"], expiresInDays: 30 },
    });
    expect(outcome).toBe("ok");
    expect(addDevice).toHaveBeenCalledWith({ deviceId: "dev-1", deviceKemPublicKey: "kem" });
    expect(calls[0].body).toEqual({ scopes: ["games"], expiresInDays: 30 });
  });

  it("drops the wrap again when activation fails", async () => {
    const { vault, removeDevice } = fakeVault();
    const { api } = routedApi({ "/api/authorized-clients/row-1/activate": json({}, 400) });
    const outcome = await allowAccessRequest({ api, vault }, { ...CLAIMED_AGENT, kind: "robot" });
    expect(outcome).toBe("failed");
    expect(removeDevice).toHaveBeenCalledWith("dev-1");
  });

  it("revokes in one call and says whether it was this client", async () => {
    const { api } = routedApi({ "/api/authorized-clients/row-1": json({ ok: true, wasCurrent: true }) });
    expect(await revokeAccess({ api }, { id: "row-1" })).toEqual({ ok: true, wasCurrent: true });
  });

  it("creates an access key in one call: wrap first, the seed never sent", async () => {
    const { vault, addDevice } = fakeVault();
    let sent: Record<string, unknown> = {};
    const { api } = routedApi({
      "/api/authorized-clients/access-keys": (init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ client: { id: "row-9" } }), { status: 201 });
      },
    });
    const result = await createAgentAccessKey({ api, vault }, { name: "Bot", scopes: ["games"], expiresInDays: 90 });
    const parsed = parseAgentAccessKey("key" in result ? result.key : "");
    expect(parsed?.deviceId).toBe(sent.deviceId);
    expect(toBase64Url(agentKeyPairs(parsed!).kem.publicKey)).toBe(sent.kemPublicKey);
    expect(addDevice).toHaveBeenCalledWith({ deviceId: sent.deviceId, deviceKemPublicKey: sent.kemPublicKey });
    expect(sent).not.toHaveProperty("password");
    expect(JSON.stringify(sent)).not.toContain(toBase64Url(parsed!.seed));
    expect(sent).toMatchObject({ name: "Bot", scopes: ["games"], expiresInDays: 90 });
  });

  it("drops the wrap again when the platform refuses the key", async () => {
    const { vault, removeDevice } = fakeVault();
    const { api } = routedApi({ "/api/authorized-clients/access-keys": json({}, 429) });
    const result = await createAgentAccessKey({ api, vault }, { name: "Bot", scopes: ["games"], expiresInDays: 7 });
    expect(result).toEqual({ error: "rate_limited" });
    expect(removeDevice).toHaveBeenCalled();
  });

  it("registers this client once per unlock", async () => {
    const device = createDevice();
    const keystore: DeviceKeystore = { load: async () => device, save: async () => {}, clear: async () => {} };
    const vault = createStore<VaultState>(() => ({ status: "locked" }) as VaultState);
    const { api, calls } = routedApi({ "/api/authorized-clients/register": json({ ok: true }) });
    watchClientRegistration({
      api,
      vault,
      deviceKeystore: keystore,
      describe: () => ({ kind: "browser", label: "Firefox on Linux" }),
    });
    vault.setState({ status: "unlocked" });
    vault.setState({ status: "unlocked", error: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ deviceId: device.deviceId, kind: "browser", label: "Firefox on Linux" });
    vault.setState({ status: "locked" });
    vault.setState({ status: "unlocked" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(2);
  });
});
