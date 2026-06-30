import { describe, expect, it } from "vitest";

import { isVisibleToKid, type SharingMap } from "./games";

type VisGame = Parameters<typeof isVisibleToKid>[0];

const KID = "kid-1";
const OTHER_KID = "kid-2";

function game(overrides: Partial<VisGame> = {}): VisGame {
  return {
    id: "game-1",
    is_system: false,
    is_active: true,
    kid_id: null,
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
  it("always shows system games, regardless of active/sharing", () => {
    const g = game({ is_system: true, is_active: false });
    expect(isVisibleToKid(g, KID, new Map())).toBe(true);
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
});
