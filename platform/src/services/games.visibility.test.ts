import { describe, expect, it } from "vitest";

import { isVisibleToKid, type SharingMap } from "./games";

type VisGame = Parameters<typeof isVisibleToKid>[0];

const KID = "kid-1";
const OTHER_KID = "kid-2";

function game(overrides: Partial<VisGame> = {}): VisGame {
  return {
    id: "game-1",
    is_active: true,
    kid_id: null,
    published_at: null,
    ...overrides,
  };
}

/** Build a SharingMap from a plain description for one game. */
function sharingMap(
  gameId: string,
  share: { family?: boolean; kidIds?: string[] },
): SharingMap {
  return new Map([
    [
      gameId,
      {
        family: share.family ?? false,
        kidIds: new Set(share.kidIds ?? []),
      },
    ],
  ]);
}

describe("isVisibleToKid", () => {
  // System games are dodi-published Discover rows: published_at is stamped, no
  // is_system special case — they share-gate exactly like the published rows
  // below (a fresh kid gets them via shareSystemGamesWithKid, not by fiat).
  it("share-gates system games like any published row", () => {
    const g = game({
      id: "system-1",
      is_active: false,
      published_at: "2026-02-28T19:47:16Z",
    });
    expect(isVisibleToKid(g, KID, new Map())).toBe(false);
    expect(isVisibleToKid(g, KID, sharingMap(g.id, { kidIds: [KID] }))).toBe(true);
    expect(isVisibleToKid(g, OTHER_KID, sharingMap(g.id, { kidIds: [KID] }))).toBe(false);
    expect(isVisibleToKid(g, KID, sharingMap(g.id, { family: true }))).toBe(true);
  });

  it("hides an inactive custom game from kids — even with a family share", () => {
    const g = game({ is_active: false });
    const sharings = sharingMap(g.id, { family: true });
    expect(isVisibleToKid(g, KID, sharings)).toBe(false);
  });

  it("hides an inactive game even from a kid it's specifically shared with", () => {
    const g = game({ is_active: false });
    const sharings = sharingMap(g.id, { kidIds: [KID] });
    expect(isVisibleToKid(g, KID, sharings)).toBe(false);
  });

  it("shows an active family-shared game to any kid", () => {
    const g = game();
    const sharings = sharingMap(g.id, { family: true });
    expect(isVisibleToKid(g, KID, sharings)).toBe(true);
    expect(isVisibleToKid(g, OTHER_KID, sharings)).toBe(true);
  });

  it("shows an active game only to the specific kids it's shared with", () => {
    const g = game();
    const sharings = sharingMap(g.id, { kidIds: [KID] });
    expect(isVisibleToKid(g, KID, sharings)).toBe(true);
    expect(isVisibleToKid(g, OTHER_KID, sharings)).toBe(false);
  });

  it("shows the owning kid their own active game without any sharing row", () => {
    const g = game({ kid_id: KID });
    expect(isVisibleToKid(g, KID, new Map())).toBe(true);
  });

  it("hides an active game with no sharing from a non-owner", () => {
    const g = game();
    expect(isVisibleToKid(g, KID, new Map())).toBe(false);
  });

  // A PENDING publication copy is a plaintext submission to the public catalog,
  // owned by the same account as the private original. `listGames` filters it
  // out at the query, and is_active=false is the second line of defence: it
  // must never turn up in a kid's library, however it is shared.
  it("hides a pending publication copy from kids, even family-shared", () => {
    const g = game({ id: "publication-1", is_active: false, kid_id: null });
    expect(isVisibleToKid(g, KID, sharingMap(g.id, { family: true }))).toBe(false);
    expect(isVisibleToKid(g, KID, sharingMap(g.id, { kidIds: [KID] }))).toBe(false);
  });

  // A PUBLISHED (LIVE) Discover row is play-in-place: visible exactly when this
  // family shared it — is_active is irrelevant (a catalog listing is never a
  // library entry by itself, and publication copies stay is_active=false).
  describe("published Discover rows", () => {
    const published = () =>
      game({
        id: "published-1",
        is_active: false,
        kid_id: null,
        published_at: "2026-07-22T12:00:00Z",
      });

    it("shows a family-shared published game to any kid", () => {
      const g = published();
      const sharings = sharingMap(g.id, { family: true });
      expect(isVisibleToKid(g, KID, sharings)).toBe(true);
      expect(isVisibleToKid(g, OTHER_KID, sharings)).toBe(true);
    });

    it("shows a kid-shared published game only to that kid", () => {
      const g = published();
      const sharings = sharingMap(g.id, { kidIds: [KID] });
      expect(isVisibleToKid(g, KID, sharings)).toBe(true);
      expect(isVisibleToKid(g, OTHER_KID, sharings)).toBe(false);
    });

    it("hides an unshared published game", () => {
      expect(isVisibleToKid(published(), KID, new Map())).toBe(false);
    });

    it("is_active does not make an unshared published game visible", () => {
      const g = { ...published(), is_active: true };
      expect(isVisibleToKid(g, KID, new Map())).toBe(false);
    });
  });
});
