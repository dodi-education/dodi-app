import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import { deviceStatusKey, loadDevices, pairDevice, revokeDevice } from "./devices";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

function routedApi(routes: Record<string, Response | Error>): PlatformApi & {
  request: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(async (path: string) => {
      const response = routes[path];
      if (!response) throw new Error(`unexpected ${path}`);
      if (response instanceof Error) throw response;
      return response;
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  };
}

function fakeVault(order: string[] = []) {
  const addDevice = vi.fn(async () => {
    order.push("addDevice");
  });
  const removeDevice = vi.fn(async () => {
    order.push("removeDevice");
  });
  return {
    vault: createStore(() => ({ addDevice, removeDevice }) as unknown as VaultState) as VaultStore,
    addDevice,
    removeDevice,
  };
}

const CLAIMED = { id: "row-1", deviceId: "dev-1", kemPublicKey: "kem" };

describe("devices", () => {
  it("lists devices, [] on any failure", async () => {
    const devices = [{ id: "a" }];
    await expect(
      loadDevices(routedApi({ "/api/devices": new Response(JSON.stringify({ devices })) })),
    ).resolves.toEqual(devices);
    await expect(
      loadDevices(routedApi({ "/api/devices": new Response("", { status: 500 }) })),
    ).resolves.toEqual([]);
    await expect(loadDevices(routedApi({ "/api/devices": new Error("offline") }))).resolves.toEqual([]);
  });

  it("wraps the vault to the claimed device before activating it", async () => {
    const order: string[] = [];
    const { vault, addDevice } = fakeVault(order);
    const api = routedApi({
      "/api/devices/claim": new Response(JSON.stringify(CLAIMED)),
      "/api/devices/row-1/activate": new Response("{}"),
    });
    api.request.mockImplementationOnce(async (path: string, init: RequestInit) => {
      order.push(path);
      expect(JSON.parse(String(init.body))).toEqual({ pairingCode: "ABC-123" });
      return new Response(JSON.stringify(CLAIMED));
    });
    await expect(pairDevice({ api, vault }, "  ABC-123 ")).resolves.toBe(true);
    expect(addDevice).toHaveBeenCalledWith({ deviceId: "dev-1", deviceKemPublicKey: "kem" });
    expect(order).toEqual(["/api/devices/claim", "addDevice"]);
    expect(api.request).toHaveBeenLastCalledWith("/api/devices/row-1/activate", { method: "POST" });
  });

  it("does not wrap the vault for a rejected code", async () => {
    const { vault, addDevice } = fakeVault();
    const api = routedApi({ "/api/devices/claim": new Response("", { status: 404 }) });
    await expect(pairDevice({ api, vault }, "nope")).resolves.toBe(false);
    await expect(pairDevice({ api, vault }, "   ")).resolves.toBe(false);
    expect(addDevice).not.toHaveBeenCalled();
  });

  it("drops the vault wrap before marking the device revoked", async () => {
    const { vault, removeDevice } = fakeVault();
    const ok = routedApi({ "/api/devices/row-1/revoke": new Response("{}") });
    await expect(revokeDevice({ api: ok, vault }, { id: "row-1", device_id: "dev-1" })).resolves.toBe(true);
    expect(removeDevice).toHaveBeenCalledWith("dev-1");

    const failed = routedApi({ "/api/devices/row-1/revoke": new Response("", { status: 500 }) });
    await expect(
      revokeDevice({ api: failed, vault }, { id: "row-1", device_id: "dev-1" }),
    ).resolves.toBe(false);
  });

  it("names each status", () => {
    expect(deviceStatusKey("active")).toBe("deviceStatusActive");
    expect(deviceStatusKey("revoked")).toBe("deviceStatusRevoked");
    expect(deviceStatusKey("pending")).toBe("deviceStatusPending");
  });
});
