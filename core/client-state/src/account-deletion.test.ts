import { describe, expect, it, vi } from "vitest";

import { deleteAccount, deleteProfile } from "./account-deletion";
import type { FamilySwitchDeps } from "./family-members";

function api(response: Response | Error) {
  return {
    request: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** What account deletion needs: the platform, plus dropping and reopening the vault. */
function switchDeps(platform: ReturnType<typeof api>) {
  const dropFamilyData = vi.fn(async () => {});
  const unlockSilently = vi.fn(async () => {});
  const deps = {
    api: platform,
    vault: { getState: () => ({ unlockSilently }) },
    dropFamilyData,
  } as unknown as FamilySwitchDeps;
  return { deps, dropFamilyData, unlockSilently };
}

const answer = (response: Response | Error) => switchDeps(api(response)).deps;

describe("deleteAccount", () => {
  it("sends the password to DELETE /api/account and reopens the vault without the account", async () => {
    const platform = api(json(200, { success: true }));
    const { deps, dropFamilyData, unlockSilently } = switchDeps(platform);

    await expect(deleteAccount(deps, "secret pw")).resolves.toEqual({ kind: "deleted" });
    expect(platform.request).toHaveBeenCalledWith("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "secret pw" }),
    });
    expect(dropFamilyData).toHaveBeenCalledOnce();
    expect(unlockSilently).toHaveBeenCalledOnce();
  });

  it("asks for the password before calling anything", async () => {
    const platform = api(json(200, {}));
    const { deps, dropFamilyData } = switchDeps(platform);

    await expect(deleteAccount(deps, "")).resolves.toEqual({ kind: "error", key: "deletePasswordRequired" });
    expect(platform.request).not.toHaveBeenCalled();
    expect(dropFamilyData).not.toHaveBeenCalled();
  });

  it("maps the platform's answers onto dialog messages", async () => {
    const cases: [Response | Error, string][] = [
      [json(403, { code: "WRONG_PASSWORD" }), "deleteWrongPassword"],
      [json(429, {}), "deleteRateLimited"],
      [json(403, { error: "role" }), "deleteFailed"],
      [json(500, {}), "deleteFailed"],
      [new Error("offline"), "deleteFailed"],
    ];
    for (const [response, key] of cases) {
      await expect(deleteAccount(answer(response), "x")).resolves.toEqual({ kind: "error", key });
    }
  });

  it("treats an account that is already gone as deleted", async () => {
    await expect(deleteAccount(answer(json(404, {})), "x")).resolves.toEqual({ kind: "deleted" });
  });
});

describe("deleteProfile", () => {
  it("sends the password to DELETE /api/me", async () => {
    const platform = api(json(200, { success: true }));

    await expect(deleteProfile({ api: platform }, "secret pw")).resolves.toEqual({ kind: "deleted" });
    expect(platform.request).toHaveBeenCalledWith("/api/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "secret pw" }),
    });
  });

  it("explains that an owner deletes their account first", async () => {
    await expect(deleteProfile({ api: api(json(409, { code: "OWNS_ACCOUNT" })) }, "x")).resolves.toEqual({
      kind: "error",
      key: "deleteProfileOwnsAccount",
    });
  });

  it("maps a wrong password like account deletion does", async () => {
    await expect(deleteProfile({ api: api(json(403, { code: "WRONG_PASSWORD" })) }, "x")).resolves.toEqual({
      kind: "error",
      key: "deleteWrongPassword",
    });
  });
});
