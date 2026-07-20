import { useCallback, useEffect, useState } from "react";

import { decodeView, ensureFriendKeys, fetchFriends } from "@/lib/friends";
import {
  type SnapshotView,
  decodeSnapshotInfo,
  fetchSnapshots,
} from "@/lib/snapshots";
import { useKids } from "@/hooks/use-kids";
import { useVaultStore } from "@/stores/vault-store";
import type { KidFriendKeys } from "@dodi/protocol";
import type { Kid } from "@dodi/types/database";
import type { SnapshotInfoV1 } from "@dodi/types/games";
import type { VaultSession } from "@dodi/vault";

export interface AccountSnapshot {
  view: SnapshotView;
  /** The account kid that owns the row. */
  kidId: string;
  kidName: string;
  /** Null = blob unreadable (wrong keys / tampered) — render a fallback row. */
  info: SnapshotInfoV1 | null;
  /** Decrypted friend name for received rows ("From Lea"). */
  senderName: string | null;
  /** Decrypted friend name for own rows created by sharing ("Sent to Lea"). */
  sentToName: string | null;
}

export interface FriendKidOption {
  id: string;
  /** Null when no friend card resolves a name (cosmetic). */
  name: string | null;
}

export interface UseAccountSnapshots {
  snapshots: AccountSnapshot[];
  /**
   * Kids from OTHER accounts that exchanged snapshots with this family,
   * name-sorted. Siblings can be friends too, so own kids are excluded even
   * when they appear on the friend side of a row.
   */
  friendKids: FriendKidOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface KidCollection {
  rows: AccountSnapshot[];
  /** Friend kids referenced by this kid's rows (sender or sent-to). */
  friends: Map<string, string | null>;
}

/**
 * One kid's full collection (incl. autosave slots) with decrypted info blobs
 * and friend names. Friend keys are only touched when a row actually references
 * a friend — browsing snapshot-only families never generates a friend identity.
 */
async function loadKidCollection(
  kid: Kid,
  session: VaultSession,
): Promise<KidCollection> {
  const views = await fetchSnapshots(kid.id, { includeAutosave: true });

  const needsFriends = views.some(
    (v) => v.origin === "received" || v.sharedWithKidId !== null,
  );
  let keys: KidFriendKeys | null = null;
  const names = new Map<string, string | null>();
  if (needsFriends) {
    keys = await ensureFriendKeys(kid, session);
    // Friend names come from the kid's own decrypted friend cards.
    try {
      for (const friendView of await fetchFriends(kid.id)) {
        const decoded = decodeView(friendView, keys, session);
        names.set(friendView.counterpartKidId, decoded.name ?? decoded.nickname);
      }
    } catch {
      // Names are cosmetic — the overview still renders without them.
    }
  }

  const friends = new Map<string, string | null>();
  const noteFriend = (id: string | null): void => {
    if (id) friends.set(id, names.get(id) ?? friends.get(id) ?? null);
  };
  const rows = views.map((view: SnapshotView): AccountSnapshot => {
    noteFriend(view.senderKidId);
    noteFriend(view.sharedWithKidId);
    return {
      view,
      kidId: kid.id,
      kidName: kid.display_name,
      info: decodeSnapshotInfo(view, session, keys),
      senderName: view.senderKidId
        ? (names.get(view.senderKidId) ?? null)
        : null,
      sentToName: view.sharedWithKidId
        ? (names.get(view.sharedWithKidId) ?? null)
        : null,
    };
  });
  return { rows, friends };
}

/**
 * Loads and decrypts every kid's snapshot collection for the parent overview:
 * own + received + the hidden autosave slots, newest first, plus the friend
 * kids the family exchanged snapshots with (for the kid filter's "Other"
 * section).
 */
export function useAccountSnapshots(): UseAccountSnapshots {
  const { kids } = useKids();

  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>([]);
  const [friendKids, setFriendKids] = useState<FriendKidOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!kids) return;
    const session = useVaultStore.getState().session;
    if (!session) {
      setError("locked");
      setLoading(false);
      return;
    }
    try {
      const collections = await Promise.all(
        kids.map((kid) => loadKidCollection(kid, session)),
      );

      const merged = collections
        .flatMap((c) => c.rows)
        .sort((a, b) => b.view.createdAt.localeCompare(a.view.createdAt));

      // Merge each kid's friend references; any resolved name wins over null.
      // Own kids can appear here too (siblings sharing with each other) — they
      // already live in the kid filter's "Own kids" section, so drop them.
      const friends = new Map<string, string | null>();
      for (const c of collections) {
        for (const [id, name] of c.friends) {
          friends.set(id, name ?? friends.get(id) ?? null);
        }
      }
      for (const kid of kids) friends.delete(kid.id);

      setSnapshots(merged);
      setFriendKids(
        [...friends]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [kids]);

  useEffect(() => {
    // Mount/kids-change fetch: reload() decrypts and sets state asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (kids) void reload();
  }, [kids, reload]);

  return { snapshots, friendKids, loading, error, reload };
}
