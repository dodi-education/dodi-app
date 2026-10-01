import { describe, expect, it, vi } from "vitest";

import {
  notificationTogglesOf,
  saveInterfacePreferences,
  saveNotificationPreferences,
} from "./account-settings";
import { type AccountState, type AccountStore, createAccountStore } from "./account-store";
import type { PlatformApi } from "./platform";

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

function loadedAccount(fields: Record<string, unknown>): AccountStore {
  const store = createAccountStore(fakeApi(new Error("unused")));
  store.setState({ account: fields, loaded: true } as unknown as Partial<AccountState>);
  return store;
}

describe("interface preferences", () => {
  it("PATCHes only the changed toggle and keeps the merged result", async () => {
    const api = fakeApi(new Response("{}"));
    const account = loadedAccount({ interface_preferences: { is_3d_enabled: true } });
    await expect(saveInterfacePreferences({ api, account }, { is_3d_enabled: false })).resolves.toBe(true);
    const [path, init] = api.request.mock.calls[0];
    expect(path).toBe("/api/account");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ interfacePreferences: { is_3d_enabled: false } });
    expect(account.getState().account?.interface_preferences).toEqual({ is_3d_enabled: false });
  });

  it("reverts the optimistic toggle when the save fails", async () => {
    const account = loadedAccount({ interface_preferences: { is_3d_enabled: true } });
    const api = fakeApi(new Response("{}", { status: 500 }));
    await expect(saveInterfacePreferences({ api, account }, { is_3d_enabled: false })).resolves.toBe(false);
    expect(account.getState().account?.interface_preferences).toEqual({ is_3d_enabled: true });
  });
});

describe("notification preferences", () => {
  it("reads absent toggles as on (opt-out)", () => {
    expect(notificationTogglesOf(null)).toEqual({ isFriendApprovalOn: true, isPublicationOutcomeOn: true });
    expect(notificationTogglesOf({ friend_approval_email: false })).toEqual({
      isFriendApprovalOn: false,
      isPublicationOutcomeOn: true,
    });
  });

  it("saves optimistically and reverts on a network error", async () => {
    const account = loadedAccount({ notification_preferences: { publication_outcome_email: false } });
    const ok = fakeApi(new Response("{}"));
    await expect(
      saveNotificationPreferences({ api: ok, account }, { friend_approval_email: false }),
    ).resolves.toBe(true);
    expect(JSON.parse(ok.request.mock.calls[0][1].body)).toEqual({
      notificationPreferences: { friend_approval_email: false },
    });
    expect(account.getState().account?.notification_preferences).toEqual({
      publication_outcome_email: false,
      friend_approval_email: false,
    });

    const offline = fakeApi(new Error("offline"));
    await expect(
      saveNotificationPreferences({ api: offline, account }, { friend_approval_email: true }),
    ).resolves.toBe(false);
    expect(account.getState().account?.notification_preferences).toEqual({
      publication_outcome_email: false,
      friend_approval_email: false,
    });
  });
});
