/**
 * Friend keys remembered for one specific kid. Switching the active kid must
 * never reuse the previous kid's keys (their sealed cards would silently fail
 * to open). Shared logic: `@dodi/client-state/friends`.
 */
export { type CachedFriendKeys, keysForKid } from "@dodi/client-state/friends";
