/**
 * Pure filter predicate for the parent Snapshots overview. Kept free of React
 * so it can be unit-tested in isolation.
 */
import type { SnapshotOrigin } from "@dodi/types/database";

export type SnapshotTypeFilter = "all" | "manual" | "autosave";
export type SnapshotUsageFilter = "all" | "stored" | "sent" | "received";

/** The per-row facts the filters decide on. */
export interface SnapshotFilterFacts {
  /** The account kid that owns the row. */
  kidId: string;
  origin: SnapshotOrigin;
  /** Friend kid the row came from (received rows). */
  senderKidId: string | null;
  /** Friend kid the row was sent to (own rows created by sharing). */
  sharedWithKidId: string | null;
}

/**
 * The kid dimension is a discriminated union because siblings on the same
 * account can be friends: an own kid's id may also appear on the friend side
 * of another kid's row, so the id alone can't tell "rows this kid owns" from
 * "rows exchanged with this kid".
 */
export type SnapshotKidFilter =
  | { kind: "all" }
  /** One of the account's own kids — rows that kid owns. */
  | { kind: "own"; kidId: string }
  /** A kid from another account — rows exchanged with that kid. */
  | { kind: "friend"; kidId: string };

export interface SnapshotFilters {
  kid: SnapshotKidFilter;
  type: SnapshotTypeFilter;
  usage: SnapshotUsageFilter;
}

export function matchesSnapshotFilters(
  facts: SnapshotFilterFacts,
  filters: SnapshotFilters,
): boolean {
  if (filters.kid.kind === "own" && facts.kidId !== filters.kid.kidId) {
    return false;
  }
  if (
    filters.kid.kind === "friend" &&
    facts.senderKidId !== filters.kid.kidId &&
    facts.sharedWithKidId !== filters.kid.kidId
  ) {
    return false;
  }
  if (filters.type === "manual" && facts.origin === "autosave") return false;
  if (filters.type === "autosave" && facts.origin !== "autosave") return false;
  // "stored" = saved by the kid themselves (own + autosave; sent copies count —
  // share implies save). "sent"/"received" narrow to the exchanged rows.
  if (filters.usage === "stored" && facts.origin === "received") return false;
  if (filters.usage === "sent" && facts.sharedWithKidId === null) return false;
  if (filters.usage === "received" && facts.origin !== "received") return false;
  return true;
}
