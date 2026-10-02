/**
 * Test doubles shared by the parent-page flow tests (kids, personas, memory,
 * friends): a routed platform API, an unlocked vault and spy stores.
 */
import { vi } from "vitest";
import { createStore } from "zustand/vanilla";

import { VaultSession } from "@dodi/vault";

import type { GameStore, GameStoreState } from "./game-store";
import type { KidStore, KidStoreState } from "./kid-store";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

type Route = Response | Error | ((init?: RequestInit) => Response);

export type RoutedApi = PlatformApi & { request: ReturnType<typeof vi.fn> };

/** Routes match the full path, or the path without its query string. */
export function routedApi(routes: Record<string, Route>): RoutedApi {
  return {
    request: vi.fn(async (path: string, init?: RequestInit) => {
      const route = routes[`${init?.method ?? "GET"} ${path}`] ?? routes[path];
      if (!route) throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
      if (route instanceof Error) throw route;
      return typeof route === "function" ? route(init) : route;
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  };
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

/** The JSON body of the n-th call to `path` (any method). */
export function bodyOf(api: RoutedApi, path: string, n = 0): Record<string, unknown> {
  const calls = api.request.mock.calls.filter(([p]) => p === path);
  const call = calls[n];
  if (!call) throw new Error(`no call ${n} to ${path}`);
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

export function unlockedVault(): { vault: VaultStore; session: VaultSession } {
  const session = new VaultSession(new Uint8Array(32).fill(7));
  return { vault: createStore(() => ({ session }) as unknown as VaultState) as VaultStore, session };
}

export function lockedVault(): VaultStore {
  return createStore(() => ({ session: null }) as unknown as VaultState) as VaultStore;
}

type Spy = ReturnType<typeof vi.fn>;

export function spyKids(): { kids: KidStore; invalidate: Spy; patchLocal: Spy } {
  const invalidate = vi.fn();
  const patchLocal = vi.fn();
  const kids = createStore(() => ({ invalidate, patchLocal }) as unknown as KidStoreState) as KidStore;
  return { kids, invalidate, patchLocal };
}

export function spyGames(): { games: GameStore; invalidate: Spy } {
  const invalidate = vi.fn();
  const games = createStore(() => ({ invalidate }) as unknown as GameStoreState) as GameStore;
  return { games, invalidate };
}
