import { useEffect, useState } from "react";
import type { LibraryGame } from "@dodi/client-state/game-store";

import { useGameStore, useVaultStore } from "@/lib/client-state";

/**
 * A kid's decrypted game library from the shared cache (web: hooks/use-games
 * useKidGames). The kid chrome unlocks the vault silently, so the first load
 * can land before the session exists; it retries once the session appears.
 */
export function useKidGames(kidId: string | null): {
  games: LibraryGame[] | null;
  loading: boolean;
  error: string | null;
} {
  const games = useGameStore((s) => (kidId ? (s.byKid[kidId] ?? null) : null));
  const loadForKid = useGameStore((s) => s.loadForKid);
  const session = useVaultStore((s) => s.session);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kidId || games !== null) return;
    loadForKid(kidId)
      .then(() => setError(null))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load games"));
  }, [kidId, games, loadForKid, session]);

  return { games, loading: kidId !== null && games === null && error === null, error };
}
