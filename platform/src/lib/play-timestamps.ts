/**
 * Bounds for client-supplied timestamps on late-synced play records and game
 * events (the offline outbox replays them when connectivity returns). A small
 * future window absorbs clock skew; the age cap keeps ancient or fabricated
 * backlogs out of the insights feed.
 */

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function isPlausiblePlayTimestamp(iso: string): boolean {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return false;
  const now = Date.now();
  return (
    timestamp <= now + MAX_FUTURE_SKEW_MS && timestamp >= now - MAX_AGE_MS
  );
}
