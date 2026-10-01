import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { AccountStore } from "./account-store";
import { persistLanguage, saveAccountPreferences } from "./onboarding";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

function fakeApi(response: Response | Error): PlatformApi & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  };
}

function fakeAccount(): { account: AccountStore; patchLocal: ReturnType<typeof vi.fn> } {
  const patchLocal = vi.fn();
  return { account: createStore(() => ({ patchLocal })) as unknown as AccountStore, patchLocal };
}

function fakeVault(hasSession: boolean): VaultStore {
  const session = hasSession ? { encryptField: (value: string) => `enc:v1:${value}` } : null;
  return createStore(() => ({ session }) as unknown as VaultState);
}

const INPUT = { dateStyle: "dmy_dot", timeStyle: "24h", timeZone: "auto", language: "de" };

describe("saving the account preferences", () => {
  it("saves an automatic timezone as nothing, and mirrors the row", async () => {
    const api = fakeApi(new Response("{}", { status: 200 }));
    const { account, patchLocal } = fakeAccount();
    await expect(
      saveAccountPreferences({ api, account, vault: fakeVault(false) }, INPUT),
    ).resolves.toBeNull();
    const [path, init] = api.request.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/account");
    expect(init.method).toBe("PATCH");
    const preferences = { dateStyle: "dmy_dot", timeStyle: "24h", timeZoneEnc: null };
    expect(JSON.parse(init.body as string)).toEqual({ datePreferences: preferences, language: "de" });
    expect(patchLocal).toHaveBeenCalledWith({ date_preferences: preferences, language: "de" });
  });

  it("seals an explicit timezone so the server never sees it", async () => {
    const api = fakeApi(new Response("{}", { status: 200 }));
    const { account } = fakeAccount();
    await saveAccountPreferences(
      { api, account, vault: fakeVault(true) },
      { ...INPUT, timeZone: "Europe/Vienna" },
    );
    const body = (api.request.mock.calls[0] as [string, RequestInit])[1].body as string;
    expect(body).not.toContain('"Europe/Vienna"');
    expect(JSON.parse(body).datePreferences.timeZoneEnc).toBe("enc:v1:Europe/Vienna");
  });

  it("needs an open vault for an explicit timezone", async () => {
    const api = fakeApi(new Response("{}", { status: 200 }));
    const { account } = fakeAccount();
    await expect(
      saveAccountPreferences(
        { api, account, vault: fakeVault(false) },
        { ...INPUT, timeZone: "Europe/Vienna" },
      ),
    ).resolves.toBe("dateVaultLocked");
    expect(api.request).not.toHaveBeenCalled();
  });

  it("reports failed saves without touching the cache", async () => {
    for (const response of [new Response("", { status: 500 }), new Error("offline")]) {
      const { account, patchLocal } = fakeAccount();
      await expect(
        saveAccountPreferences({ api: fakeApi(response), account, vault: fakeVault(true) }, INPUT),
      ).resolves.toBe("saveFailed");
      expect(patchLocal).not.toHaveBeenCalled();
    }
  });
});

describe("persisting the language", () => {
  it("patches the account and mirrors it on success only", async () => {
    const ok = fakeAccount();
    await persistLanguage({ api: fakeApi(new Response("{}")), account: ok.account }, "de");
    expect(ok.patchLocal).toHaveBeenCalledWith({ language: "de" });

    const failed = fakeAccount();
    await persistLanguage({ api: fakeApi(new Error("401")), account: failed.account }, "de");
    expect(failed.patchLocal).not.toHaveBeenCalled();
  });
});
