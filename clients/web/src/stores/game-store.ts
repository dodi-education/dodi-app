// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

import type { GameContentFields, GameCreateFields } from "@dodi/vault/game-crypto";
import type { Game, GameVersion } from "@dodi/types/database";

export type { AccountGame, GamePatch, LibraryGame } from "@dodi/client-state";

/** The SINGLE decrypt point for games (kid library, studio list, single rows, Discover). */
export const useGameStore = bindStore(clientState.games);

/** Seal/open helpers for rows that travel outside the store (write payloads, responses). */
export function sealGameFields<T extends GameContentFields>(fields: T): Promise<T> {
  return clientState.gameCrypto.sealGameFields(fields);
}

export function sealGameCreateFields<T extends GameCreateFields>(fields: T): Promise<T> {
  return clientState.gameCrypto.sealGameCreateFields(fields);
}

export function decryptGameResponse(row: Game): Promise<Game> {
  return clientState.gameCrypto.decryptGameResponse(row);
}

export function decryptVersionResponse(row: GameVersion): Promise<GameVersion> {
  return clientState.gameCrypto.decryptVersionResponse(row);
}
