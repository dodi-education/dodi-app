import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { AccountStore } from "./account-store";
import { initialDateSettings, readStoredDatePref, saveDateSettings } from "./date-preferences";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

import type { VaultSession } from "@dodi/vault";

const session = {
  encryptField: (value: string) => `enc:v1:${value}`,
  decryptField: (value: string) => value.replace("enc:v1:", ""),
} as unknown as VaultSession;

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

function deps(response: Response | Error, hasSession = true) {
  const patchLocal = vi.fn();
  return {
    api: fakeApi(response),
    account: createStore(() => ({ patchLocal })) as unknown as AccountStore,
    vault: createStore(() => ({ session: hasSession ? session : null }) as unknown as VaultState) as VaultStore,
    patchLocal,
  };
}

const BASE = { dateStyle: "numeric", timeStyle: "12h" };

describe("reading the stored preference", () => {
  it("opens a sealed timezone and keeps the styles", () => {
    expect(
      readStoredDatePref({ dateStyle: "long", timeZoneEnc: "enc:v1:Europe/Vienna" }, session),
    ).toEqual({ dateStyle: "long", timeZone: "Europe/Vienna" });
    expect(readStoredDatePref({ timeZoneEnc: "enc:v1:Europe/Vienna" }, null)).toEqual({});
    expect(readStoredDatePref(null, session)).toEqual({});
  });

  it("waits for the vault before filling the form", () => {
    expect(initialDateSettings({ timeZoneEnc: "enc:v1:Europe/Vienna" }, null, BASE)).toBeNull();
    expect(initialDateSettings({ timeZoneEnc: "enc:v1:Europe/Vienna" }, session, BASE)).toEqual({
      dateStyle: "numeric",
      timeStyle: "12h",
      timeZone: "Europe/Vienna",
    });
    expect(initialDateSettings(null, null, BASE)).toEqual({ ...BASE, timeZone: "auto" });
  });
});

describe("saving", () => {
  it("seals an explicit timezone and mirrors the saved preference", async () => {
    const d = deps(new Response("{}"));
    await expect(
      saveDateSettings(d, { dateStyle: "dmy_dot", timeStyle: "24h", timeZone: "Europe/Vienna" }),
    ).resolves.toBeNull();
    const sent = JSON.parse(d.api.request.mock.calls[0][1].body);
    expect(sent).toEqual({
      datePreferences: { dateStyle: "dmy_dot", timeStyle: "24h", timeZoneEnc: "enc:v1:Europe/Vienna" },
    });
    expect(d.patchLocal).toHaveBeenCalledWith({ date_preferences: sent.datePreferences });
  });

  it("stores nothing for an automatic timezone, even with the vault locked", async () => {
    const d = deps(new Response("{}"), false);
    await expect(
      saveDateSettings(d, { dateStyle: "numeric", timeStyle: "12h", timeZone: "auto" }),
    ).resolves.toBeNull();
    expect(JSON.parse(d.api.request.mock.calls[0][1].body).datePreferences.timeZoneEnc).toBeNull();
  });

  it("refuses an explicit timezone while the vault is locked", async () => {
    const d = deps(new Response("{}"), false);
    await expect(
      saveDateSettings(d, { dateStyle: "numeric", timeStyle: "12h", timeZone: "Europe/Vienna" }),
    ).resolves.toEqual({ key: "dateVaultLocked" });
    expect(d.api.request).not.toHaveBeenCalled();
  });

  it("passes the server's error through, else the generic key", async () => {
    const draft = { dateStyle: "numeric", timeStyle: "12h", timeZone: "auto" };
    const withMessage = deps(new Response(JSON.stringify({ error: "Bad style" }), { status: 400 }));
    await expect(saveDateSettings(withMessage, draft)).resolves.toEqual({ message: "Bad style" });
    const bare = deps(new Response("", { status: 500 }));
    await expect(saveDateSettings(bare, draft)).resolves.toEqual({ key: "dateSaveFailed" });
    expect(bare.patchLocal).not.toHaveBeenCalled();
  });
});
