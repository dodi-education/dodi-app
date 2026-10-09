import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import { base64ToBytes } from "@dodi/vault/character-asset-crypto";

import type { AccountState, AccountStore } from "./account-store";
import {
  AssetPublicationRequestError,
  assetPublicationErrorKey,
  assetPublicationStateKey,
  canSubmitAssetShare,
  createAssetPublicationStore,
  isAssetShareFormMode,
} from "./character-asset-publication";
import type { CharacterAssetStore, CharacterAssetsState } from "./character-asset-store";
import { bodyOf, json, routedApi } from "./parent-pages.test-support";

const HAT = "6f1c1d1e-0000-4000-8000-000000000002";
const PATH = `/api/character-assets/${HAT}/publication`;
const GLB = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);

const status = (state: "in_review" | "live" | "rejected", reason: string | null = null) => ({
  id: "pub-1",
  state,
  submitted_at: "t",
  published_at: state === "live" ? "t" : null,
  rejected_at: state === "rejected" ? "t" : null,
  rejection_reason: reason,
});

function deps(handle: string | null) {
  const patchLocal = vi.fn();
  const account = createStore(
    () => ({ account: { publication_handle: handle }, patchLocal }) as unknown as AccountState,
  ) as AccountStore;
  const getBytes = vi.fn(async () => GLB);
  const characterAssets = createStore(() => ({ getBytes }) as unknown as CharacterAssetsState) as CharacterAssetStore;
  return { account, characterAssets, getBytes, patchLocal };
}

describe("asset publication store", () => {
  it("loads a status once per asset", async () => {
    const api = routedApi({ [PATH]: json({ publication: status("in_review") }) });
    const store = createAssetPublicationStore({ api, ...deps("maker") });
    const [a, b] = await Promise.all([store.getState().load(HAT), store.getState().load(HAT)]);
    expect(a?.state).toBe("in_review");
    expect(b).toBe(a);
    await store.getState().load(HAT);
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(store.getState().byAssetId[HAT]?.state).toBe("in_review");
  });

  it("posts a plaintext copy of the opened file", async () => {
    const api = routedApi({ [`POST ${PATH}`]: json({ publication: status("in_review") }, 201) });
    const d = deps("maker");
    const store = createAssetPublicationStore({ api, ...d });
    const result = await store.getState().submit(HAT, { name: "  Wizard hat ", description: "Pointy" });
    expect(result.state).toBe("in_review");
    const body = bodyOf(api, PATH);
    expect(body).toMatchObject({ name: "Wizard hat", description: "Pointy", previewImage: null });
    expect(base64ToBytes(String(body.glbBase64))).toEqual(GLB);
    expect(d.getBytes).toHaveBeenCalledWith(HAT);
    expect(store.getState().byAssetId[HAT]?.state).toBe("in_review");
  });

  it("claims a handle first when the account has none", async () => {
    const api = routedApi({
      "PUT /api/account/publication-handle": json({ ok: true }),
      [`POST ${PATH}`]: json({ publication: status("in_review") }, 201),
    });
    const d = deps(null);
    const store = createAssetPublicationStore({ api, ...d });
    await store.getState().submit(HAT, { name: "Hat", description: "", handle: "maker" });
    expect(bodyOf(api, "/api/account/publication-handle")).toEqual({ handle: "maker" });
    expect(d.patchLocal).toHaveBeenCalledWith({ publication_handle: "maker" });
  });

  it("maps refusals to typed failures", async () => {
    const cases: [Response, string, string[]][] = [
      [json({ error: "handle_required" }, 409), "handle-required", []],
      [json({ error: "invalid_file", details: ["no mesh"] }, 400), "invalid-file", ["no mesh"]],
      [json({ error: "limit_reached" }, 429), "limit-reached", []],
      [json({ error: "boom" }, 500), "failed", []],
    ];
    for (const [response, failure, details] of cases) {
      const api = routedApi({ [`POST ${PATH}`]: response });
      const store = createAssetPublicationStore({ api, ...deps("maker") });
      const error = await store.getState().submit(HAT, { name: "Hat", description: "" }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AssetPublicationRequestError);
      expect((error as AssetPublicationRequestError).failure).toBe(failure);
      expect((error as AssetPublicationRequestError).details).toEqual(details);
      expect(assetPublicationErrorKey((error as AssetPublicationRequestError).failure)).toMatch(/^share/);
    }
  });

  it("maps a taken handle and withdraws", async () => {
    const api = routedApi({
      "PUT /api/account/publication-handle": json({ reason: "taken" }, 409),
      [`DELETE ${PATH}`]: json({ ok: true }),
    });
    const store = createAssetPublicationStore({ api, ...deps(null) });
    const error = await store.getState().submit(HAT, { name: "Hat", description: "", handle: "maker" }).catch((e: unknown) => e);
    expect((error as AssetPublicationRequestError).failure).toBe("handle-taken");
    store.setState({ byAssetId: { [HAT]: status("live") } });
    await store.getState().withdraw(HAT);
    expect(store.getState().byAssetId[HAT]).toBeNull();
  });

  it("names each state", () => {
    expect(assetPublicationStateKey(null)).toBeNull();
    expect(assetPublicationStateKey(status("in_review"))).toBe("shareStateInReview");
    expect(assetPublicationStateKey(status("live"))).toBe("shareStateLive");
    expect(assetPublicationStateKey(status("rejected", "no"))).toBe("shareStateRejected");
  });

  it("asks for input when unsubmitted or rejected, and gates submit", () => {
    expect(isAssetShareFormMode(null)).toBe(true);
    expect(isAssetShareFormMode(status("rejected"))).toBe(true);
    expect(isAssetShareFormMode(status("live"))).toBe(false);
    expect(isAssetShareFormMode(status("in_review"))).toBe(false);
    const base = { name: "Hat", storedHandle: "maker", normalizedHandle: "", hasHandleProblem: false, isBusy: false };
    expect(canSubmitAssetShare(base)).toBe(true);
    expect(canSubmitAssetShare({ ...base, name: "  " })).toBe(false);
    expect(canSubmitAssetShare({ ...base, isBusy: true })).toBe(false);
    expect(canSubmitAssetShare({ ...base, storedHandle: null })).toBe(false);
    expect(canSubmitAssetShare({ ...base, storedHandle: null, normalizedHandle: "maker" })).toBe(true);
    expect(canSubmitAssetShare({ ...base, storedHandle: null, normalizedHandle: "x", hasHandleProblem: true })).toBe(false);
  });
});
