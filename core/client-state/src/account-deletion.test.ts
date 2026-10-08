import { describe, expect, it, vi } from "vitest";

import { deleteAccount } from "./account-deletion";

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

describe("deleteAccount", () => {
  it("sends the password to DELETE /api/account", async () => {
    const platform = api(json(200, { success: true }));

    await expect(deleteAccount({ api: platform }, "secret pw")).resolves.toEqual({ kind: "deleted" });
    expect(platform.request).toHaveBeenCalledWith("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "secret pw" }),
    });
  });

  it("asks for the password before calling anything", async () => {
    const platform = api(json(200, {}));

    await expect(deleteAccount({ api: platform }, "")).resolves.toEqual({
      kind: "error",
      key: "deleteAccountPasswordRequired",
    });
    expect(platform.request).not.toHaveBeenCalled();
  });

  it("maps the platform's answers onto dialog messages", async () => {
    await expect(deleteAccount({ api: api(json(403, { code: "WRONG_PASSWORD" })) }, "x")).resolves.toEqual({
      kind: "error",
      key: "deleteAccountWrongPassword",
    });
    await expect(deleteAccount({ api: api(json(429, {})) }, "x")).resolves.toEqual({
      kind: "error",
      key: "deleteAccountRateLimited",
    });
    await expect(deleteAccount({ api: api(json(403, { error: "device" })) }, "x")).resolves.toEqual({
      kind: "error",
      key: "deleteAccountFailed",
    });
    await expect(deleteAccount({ api: api(json(500, {})) }, "x")).resolves.toEqual({
      kind: "error",
      key: "deleteAccountFailed",
    });
    await expect(deleteAccount({ api: api(new Error("offline")) }, "x")).resolves.toEqual({
      kind: "error",
      key: "deleteAccountFailed",
    });
  });

  it("treats an account that is already gone as deleted", async () => {
    await expect(deleteAccount({ api: api(json(404, {})) }, "x")).resolves.toEqual({ kind: "deleted" });
  });
});
