import { useEffect, useState } from "react";

import {
  type AccountGame,
  type LibraryGame,
  useGameStore,
} from "@/stores/game-store";
import { useVaultStore } from "@/stores/vault-store";

interface GamesResult<T> {
  games: T[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Client hook over the game cache: loads a kid's decrypted library once (via the
 * VaultSession) and returns it reactively. Reused across reader pages so
 * navigation shares one fetch + decrypt.
 */
export function useKidGames(kidId: string | null): GamesResult<LibraryGame> {
  const games = useGameStore((s) => (kidId ? (s.byKid[kidId] ?? null) : null));
  const loadForKid = useGameStore((s) => s.loadForKid);
  // The kid layout unlocks the vault silently rather than blocking, so the first
  // load can land before the session exists and reject with "Vault is locked".
  // Retry once the session appears, so the library fills without a manual reload.
  const session = useVaultStore((s) => s.session);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kidId || games !== null) return;
    loadForKid(kidId)
      .then(() => setError(null))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load games"),
      );
  }, [kidId, games, loadForKid, session]);

  return {
    games,
    loading: kidId !== null && games === null && error === null,
    error,
    reload: () => {
      if (kidId) void useGameStore.getState().loadForKid(kidId, true);
    },
  };
}

/** The parent studio list: every custom game in the account, decrypted once. */
export function useAccountGames(): GamesResult<AccountGame> {
  const games = useGameStore((s) => s.account);
  const loadAccount = useGameStore((s) => s.loadAccount);
  const session = useVaultStore((s) => s.session);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (games !== null) return;
    loadAccount()
      .then(() => setError(null))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load games"),
      );
  }, [games, loadAccount, session]);

  return {
    games,
    loading: games === null && error === null,
    error,
    reload: () => {
      void useGameStore.getState().loadAccount(true);
    },
  };
}
