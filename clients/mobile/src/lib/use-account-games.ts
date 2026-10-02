import { useEffect } from "react";
import type { AccountGame } from "@dodi/client-state/game-store";

import { useGameStore, useVaultStore } from "@/lib/client-state";

/**
 * Every custom game in the account, decrypted once in the shared cache (web:
 * hooks/use-games useAccountGames). Retries when the vault session appears.
 */
export function useAccountGames(): { games: AccountGame[] | null } {
  const games = useGameStore((s) => s.account);
  const loadAccount = useGameStore((s) => s.loadAccount);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    if (games === null) void loadAccount().catch(() => {});
  }, [games, loadAccount, session]);

  return { games };
}
