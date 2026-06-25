import type { ProfileFriendKeys } from "@dodi/protocol";

/** Friend keys remembered for one specific profile. */
export interface CachedFriendKeys {
  profileId: string;
  keys: ProfileFriendKeys;
}

/**
 * Return the cached keys only when they belong to `profileId`. Switching the
 * active kid must never reuse the previous kid's keys — doing so would try to
 * open the new kid's sealed cards with the wrong secret key and silently fail
 * (names render as "—" until a full reload). Kept pure so it's unit-testable
 * without the React/vault/network machinery the hook needs.
 */
export function keysForProfile(
  cache: CachedFriendKeys | null,
  profileId: string,
): ProfileFriendKeys | null {
  return cache && cache.profileId === profileId ? cache.keys : null;
}
