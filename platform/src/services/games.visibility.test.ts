import { describe, expect, it } from "vitest";

import { isVisibleToProfile, type SharingMap } from "./games";

type VisGame = Parameters<typeof isVisibleToProfile>[0];

const KID = "kid-1";
const OTHER_KID = "kid-2";

function game(overrides: Partial<VisGame> = {}): VisGame {
  return {
    id: "game-1",
    is_system: false,
    is_active: true,
    profile_id: null,
    ...overrides,
  };
}

/** Build a SharingMap from a plain description for one game. */
function sharingMap(
  gameId: string,
  share: { family?: boolean; profileIds?: string[] },
): SharingMap {
  return new Map([
    [
      gameId,
      {
        family: share.family ?? false,
        profileIds: new Set(share.profileIds ?? []),
      },
    ],
  ]);
}

describe("isVisibleToProfile", () => {
  it("always shows system games, regardless of active/sharing", () => {
    const g = game({ is_system: true, is_active: false });
    expect(isVisibleToProfile(g, KID, new Map())).toBe(true);
  });

  it("hides an inactive custom game from kids — even with a family share", () => {
    const g = game({ is_active: false });
    const sharings = sharingMap(g.id, { family: true });
    expect(isVisibleToProfile(g, KID, sharings)).toBe(false);
  });

  it("hides an inactive game even from a kid it's specifically shared with", () => {
    const g = game({ is_active: false });
    const sharings = sharingMap(g.id, { profileIds: [KID] });
    expect(isVisibleToProfile(g, KID, sharings)).toBe(false);
  });

  it("shows an active family-shared game to any profile", () => {
    const g = game();
    const sharings = sharingMap(g.id, { family: true });
    expect(isVisibleToProfile(g, KID, sharings)).toBe(true);
    expect(isVisibleToProfile(g, OTHER_KID, sharings)).toBe(true);
  });

  it("shows an active game only to the specific profiles it's shared with", () => {
    const g = game();
    const sharings = sharingMap(g.id, { profileIds: [KID] });
    expect(isVisibleToProfile(g, KID, sharings)).toBe(true);
    expect(isVisibleToProfile(g, OTHER_KID, sharings)).toBe(false);
  });

  it("shows the owning kid their own active game without any sharing row", () => {
    const g = game({ profile_id: KID });
    expect(isVisibleToProfile(g, KID, new Map())).toBe(true);
  });

  it("hides an active game with no sharing from a non-owner", () => {
    const g = game();
    expect(isVisibleToProfile(g, KID, new Map())).toBe(false);
  });
});
