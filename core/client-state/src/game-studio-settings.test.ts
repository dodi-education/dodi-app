import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { Account } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import type { AccountStore } from "./account-store";
import {
  initialScreenshotService,
  isScreenshotUrlInvalid,
  saveScreenshotService,
} from "./game-studio-settings";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

const session = {
  encryptField: (value: string) => `enc:v1:${value}`,
  decryptField: (value: string) => value.replace("enc:v1:", ""),
} as unknown as VaultSession;

const accountWith = (setting: unknown): Account => ({ game_screenshot_service: setting }) as unknown as Account;

function deps(response: Response | Error, hasSession = true) {
  const patchLocal = vi.fn();
  const api = {
    request: vi.fn(async (_path: string, _init?: RequestInit) => {
      if (response instanceof Error) throw response;
      return response;
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  } satisfies PlatformApi;
  return {
    api,
    account: createStore(() => ({ patchLocal })) as unknown as AccountStore,
    vault: createStore(() => ({ session: hasSession ? session : null }) as unknown as VaultState) as VaultStore,
    patchLocal,
  };
}

describe("the form's initial values", () => {
  it("opens a sealed custom URL, waiting for the vault", () => {
    const account = accountWith({ mode: "custom", customUrlEnc: "enc:v1:https://shots.example" });
    expect(initialScreenshotService(account, null)).toBeNull();
    expect(initialScreenshotService(account, session)).toEqual({ mode: "custom", customUrl: "https://shots.example" });
  });

  it("falls back to the default while the account is unloaded", () => {
    expect(initialScreenshotService(null, null)).toEqual({ mode: "dodi", customUrl: "" });
  });
});

describe("validating the custom URL", () => {
  it("flags only a typed-in URL the platform refuses", () => {
    expect(isScreenshotUrlInvalid({ mode: "custom", customUrl: "" })).toBe(false);
    expect(isScreenshotUrlInvalid({ mode: "custom", customUrl: "http://shots.example" })).toBe(true);
    expect(isScreenshotUrlInvalid({ mode: "custom", customUrl: "https://shots.example" })).toBe(false);
    expect(isScreenshotUrlInvalid({ mode: "off", customUrl: "nonsense" })).toBe(false);
  });
});

describe("saving", () => {
  it("seals a custom URL before it leaves the device", async () => {
    const d = deps(new Response("{}"));
    await expect(saveScreenshotService(d, { mode: "custom", customUrl: " https://shots.example " })).resolves.toBeNull();
    const body = JSON.parse(d.api.request.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({ gameScreenshotService: { mode: "custom", customUrlEnc: "enc:v1:https://shots.example" } });
    expect(d.patchLocal).toHaveBeenCalledWith({ game_screenshot_service: body.gameScreenshotService });
  });

  it("refuses a custom URL while the vault is locked, or an invalid one", async () => {
    const locked = deps(new Response("{}"), false);
    await expect(saveScreenshotService(locked, { mode: "custom", customUrl: "https://a.example" })).resolves.toEqual({
      key: "screenshotServiceVaultLocked",
    });
    await expect(saveScreenshotService(locked, { mode: "custom", customUrl: "ftp://a" })).resolves.toEqual({
      key: "screenshotServiceUrlInvalid",
    });
    expect(locked.api.request).not.toHaveBeenCalled();
  });

  it("reports the server's message and leaves the cache alone", async () => {
    const d = deps(new Response(JSON.stringify({ error: "nope" }), { status: 400 }));
    await expect(saveScreenshotService(d, { mode: "off", customUrl: "" })).resolves.toEqual({ message: "nope" });
    expect(d.patchLocal).not.toHaveBeenCalled();
  });
});
