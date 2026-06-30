import type { KidFriendKeys } from "@dodi/protocol";

/** Friend keys remembered for one specific kid. */
export interface CachedFriendKeys {
  kidId: string;
  keys: KidFriendKeys;
}

/**
 * Return the cached keys only when they belong to `kidId`. Switching the
 * active kid must never reuse the previous kid's keys — doing so would try to
 * open the new kid's sealed cards with the wrong secret key and silently fail
 * (names render as "—" until a full reload). Kept pure so it's unit-testable
 * without the React/vault/network machinery the hook needs.
 */
export function keysForKid(
  cache: CachedFriendKeys | null,
  kidId: string,
): KidFriendKeys | null {
  return cache && cache.kidId === kidId ? cache.keys : null;
}
