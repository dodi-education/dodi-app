import { describe, expect, it, vi } from "vitest";

import { generateKidFriendKeys, openFriendCard, publishedFriendKeys, wrapKidSecretKeys } from "@dodi/protocol/friend-card";
import type { SealedEnvelope } from "@dodi/protocol/envelope";
import type { FriendCard, Kid, Persona } from "@dodi/types/database";

import { FlowError, flowErrorText, VAULT_LOCKED_MESSAGE } from "./flow-error";
import {
  KID_LANGUAGE_OPTIONS,
  canonicalSocialId,
  createKid,
  deleteKid,
  emptyPinSlots,
  invalidKidFields,
  isPinIncomplete,
  kidDatePrefsFormOf,
  kidInitial,
  kidProfileFormOf,
  parseStoredPin,
  saveKidDatePreferences,
  saveKidPin,
  setKidPersona,
  updateKidProfile,
} from "./kid-profile";
import { bodyOf, json, lockedVault, routedApi, spyGames, spyKids, unlockedVault } from "./parent-pages.test-support";

const KID = {
  id: "k1",
  display_name: "Mia",
  social_id: "MIA-123",
  birthdate: "2018-05-01",
  language: "de",
  avatar_config: null,
  friend_secret_keys: null,
  can_add_friends: null,
  can_be_added_as_friend: false,
  incoming_friend_requests_require_parent_approval: null,
  outgoing_friend_requests_require_parent_approval: true,
  date_preferences: null,
} as unknown as Kid;

describe("kid profile", () => {
  it("offers the supported languages by native name", () => {
    expect(KID_LANGUAGE_OPTIONS).toEqual([
      { value: "en", label: "English" },
      { value: "de", label: "Deutsch" },
    ]);
  });

  it("validates and canonicalizes form fields", () => {
    expect(invalidKidFields({ displayName: " " })).toEqual({ name: true, socialId: false });
    expect(invalidKidFields({ displayName: "A", socialId: "" })).toEqual({ name: false, socialId: true });
    expect(canonicalSocialId("ab-c1")).toBe("AB-C1");
    expect(kidInitial("mia")).toBe("M");
    expect(kidInitial(null)).toBe("");
  });

  it("creates a kid with sealed fields and drops the kid and game caches", async () => {
    const { vault, session } = unlockedVault();
    const { kids, invalidate } = spyKids();
    const { games, invalidate: invalidateGames } = spyGames();
    const api = routedApi({ "/api/kids": json({ id: "k2" }, 201) });

    await createKid({ api, kids, vault, games }, { displayName: "Ben", birthdate: "", language: "en" });

    const body = bodyOf(api, "/api/kids");
    expect(String(body.display_name)).toMatch(/^enc:v1:/);
    expect(session.decryptField(body.display_name as string)).toBe("Ben");
    expect(body.birthdate).toBeUndefined();
    expect(body.language).toBe("en");
    expect(invalidate).toHaveBeenCalled();
    expect(invalidateGames).toHaveBeenCalled();
  });

  it("reports a locked vault and the server's error text", async () => {
    const { kids } = spyKids();
    const { games } = spyGames();
    const api = routedApi({ "/api/kids": json({ error: "Limit reached" }, 400) });
    const form = { displayName: "Ben", birthdate: "", language: "en" };

    const locked = await createKid({ api, kids, vault: lockedVault(), games }, form).catch((e: unknown) => e);
    expect(flowErrorText(locked, "fallback")).toBe(VAULT_LOCKED_MESSAGE);

    const failed = await createKid({ api, kids, vault: unlockedVault().vault, games }, form).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(FlowError);
    expect(flowErrorText(failed, "fallback")).toBe("Limit reached");
    expect(flowErrorText(new FlowError("request_failed"), "fallback")).toBe("fallback");
  });

  it("opens the edit form with the web's defaults", () => {
    expect(kidProfileFormOf(KID)).toEqual({
      displayName: "Mia",
      socialId: "MIA-123",
      birthdate: "2018-05-01",
      language: "de",
      canAddFriends: true,
      canBeAddedAsFriend: false,
      incomingApproval: true,
      outgoingApproval: true,
    });
  });

  it("saves the profile sealed, then re-seals the friend cards", async () => {
    const { vault, session } = unlockedVault();
    const { kids, invalidate } = spyKids();
    // The kid already has friend keys; one friend (as requester) gets both cards.
    const myKeys = generateKidFriendKeys();
    const friendKeys = generateKidFriendKeys();
    const kid = { ...KID, friend_secret_keys: wrapKidSecretKeys(session, myKeys) } as Kid;
    const api = routedApi({
      "/api/kids/k1": json({}),
      "/api/friends/card-targets?kidId=k1": json([
        { friendshipId: "f1", side: "requester", counterpartKemPublicKey: publishedFriendKeys(friendKeys).kemPublicKey },
        { friendshipId: "f2", side: "addressee", counterpartKemPublicKey: null },
      ]),
      "/api/friends/refresh-cards": json({}),
    });

    const form = { ...kidProfileFormOf(kid), displayName: "Mila", birthdate: "" };
    await updateKidProfile({ api, kids, vault }, kid, form);

    const patch = bodyOf(api, "/api/kids/k1");
    expect(session.decryptField(patch.display_name as string)).toBe("Mila");
    expect(patch.birthdate).toBeNull();
    expect(patch.social_id).toBe("MIA-123");
    expect(patch.outgoing_friend_requests_require_parent_approval).toBe(true);

    const refresh = bodyOf(api, "/api/friends/refresh-cards") as {
      kidId: string;
      cards: { friendshipId: string; previewCard?: string; card: string }[];
    };
    expect(refresh.kidId).toBe("k1");
    expect(refresh.cards).toHaveLength(1);
    expect(refresh.cards[0].previewCard).toBeDefined();
    const card = openFriendCard<FriendCard>(
      friendKeys.kem.secretKey,
      JSON.parse(refresh.cards[0].card) as SealedEnvelope,
    );
    expect(card).toMatchObject({ displayName: "Mila", birthdate: null });
    expect(invalidate).toHaveBeenCalled();
  });

  it("keeps a saved profile when the friend-card refresh fails", async () => {
    const { vault } = unlockedVault();
    const { kids, invalidate } = spyKids();
    const api = routedApi({
      "/api/kids/k1": json({}),
      "/api/friends/card-targets?kidId=k1": new TypeError("offline"),
    });
    await expect(updateKidProfile({ api, kids, vault }, KID, kidProfileFormOf(KID))).resolves.toBeUndefined();
    expect(invalidate).toHaveBeenCalled();
  });

  it("parses, validates and saves the avatar-PIN puzzle", async () => {
    expect(parseStoredPin(null)).toBeNull();
    expect(parseStoredPin("nope")).toBeNull();
    expect(parseStoredPin('["a","b"]')).toBeNull();
    expect(parseStoredPin('["a","b","c"]')).toEqual(["a", "b", "c"]);
    expect(isPinIncomplete(true, ["a", null, "c"])).toBe(true);
    expect(isPinIncomplete(false, emptyPinSlots())).toBe(false);

    const { vault, session } = unlockedVault();
    const { kids } = spyKids();
    const api = routedApi({ "/api/kids/k1": json({}) });
    await saveKidPin({ api, kids, vault }, "k1", true, ["a", "b", "c"]);
    expect(session.decryptField(bodyOf(api, "/api/kids/k1").avatar_pin as string)).toBe('["a","b","c"]');
    await saveKidPin({ api, kids, vault }, "k1", false, ["a", "b", "c"]);
    expect(bodyOf(api, "/api/kids/k1", 1)).toEqual({ avatar_pin: null });
  });

  it("reads and saves the per-kid date override (zone sealed)", async () => {
    const { vault, session } = unlockedVault();
    const kid = {
      ...KID,
      date_preferences: { dateStyle: "long", timeZoneEnc: session.encryptField("Europe/Vienna") },
    } as unknown as Kid;
    expect(kidDatePrefsFormOf(kid, session)).toEqual({
      dateStyle: "long",
      timeStyle: "",
      timeZone: "Europe/Vienna",
    });
    expect(kidDatePrefsFormOf(kid, null).timeZone).toBe("");

    const { kids } = spyKids();
    const api = routedApi({ "/api/kids/k1": json({}) });
    await saveKidDatePreferences({ api, kids, vault }, "k1", { dateStyle: "", timeStyle: "24h", timeZone: "Asia/Tokyo" });
    const body = bodyOf(api, "/api/kids/k1") as { date_preferences: Record<string, string> };
    expect(body.date_preferences.dateStyle).toBeUndefined();
    expect(body.date_preferences.timeStyle).toBe("24h");
    expect(session.decryptField(body.date_preferences.timeZoneEnc)).toBe("Asia/Tokyo");

    // No zone: no vault needed.
    await saveKidDatePreferences({ api, kids, vault: lockedVault() }, "k1", { dateStyle: "", timeStyle: "", timeZone: "" });
    expect(bodyOf(api, "/api/kids/k1", 1)).toEqual({ date_preferences: {} });
  });

  it("switches the persona and mirrors it into the cached kid", async () => {
    const { vault } = unlockedVault();
    const { kids, patchLocal } = spyKids();
    const api = routedApi({ "/api/kids/k1": json({}) });
    const personas = [
      { id: "p1", name: "Explorer", account_id: "a1", is_system_default: false, soul: "…" },
    ] as unknown as Persona[];

    await expect(setKidPersona({ api, kids, vault }, "k1", "p1", personas)).resolves.toBe(true);
    expect(bodyOf(api, "/api/kids/k1")).toEqual({ active_persona_id: "p1" });
    expect(patchLocal).toHaveBeenCalledWith("k1", {
      active_persona: { id: "p1", name: "Explorer", account_id: "a1", is_system_default: false },
    });

    await setKidPersona({ api, kids, vault }, "k1", null, personas);
    expect(patchLocal).toHaveBeenLastCalledWith("k1", { active_persona: null });

    const failing = routedApi({ "/api/kids/k1": json({}, 500) });
    patchLocal.mockClear();
    await expect(setKidPersona({ api: failing, kids, vault }, "k1", "p1", personas)).resolves.toBe(false);
    expect(patchLocal).not.toHaveBeenCalled();
  });

  it("deletes a kid and drops the cache; a failure throws", async () => {
    const { vault } = unlockedVault();
    const { kids, invalidate } = spyKids();
    await deleteKid({ api: routedApi({ "/api/kids/k1": json({}) }), kids, vault }, "k1");
    expect(invalidate).toHaveBeenCalled();
    await expect(
      deleteKid({ api: routedApi({ "/api/kids/k1": json({}, 500) }), kids, vault }, "k1"),
    ).rejects.toBeInstanceOf(FlowError);
  });

  it("never sends a request while the vault is locked", async () => {
    const { kids } = spyKids();
    const api = routedApi({});
    const spy = vi.spyOn(api, "request");
    await expect(saveKidPin({ api, kids, vault: lockedVault() }, "k1", true, ["a", "b", "c"])).rejects.toMatchObject({
      reason: "vault_locked",
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
