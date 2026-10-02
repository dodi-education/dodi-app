/**
 * Persisted companion-presence state (kids.deafened_dodi_at = hearing,
 * kids.muted_dodi_at = output).
 *
 * Two independent, deliberate kid toggles. Each must never be lost or guessed
 * at, so each is written through its own outbox (durable before the request is
 * even attempted) and re-read from the kid row at every bring-up. The machinery
 * is shared and keyed by field; the storage keys are the ones the web has
 * always used, so parked toggles survive upgrades.
 */
import type { Kid } from "@dodi/types/database";

import type { KidStore } from "./kid-store";
import type { DeviceStorage, PlatformApi } from "./platform";

export type PresenceField = "deafened_dodi_at" | "muted_dodi_at";

const PRESENCE_OUTBOX_PREFIX: Record<PresenceField, string> = {
  deafened_dodi_at: "dodi-deafened-pending-",
  muted_dodi_at: "dodi-muted-pending-",
};

export interface PresenceDeps {
  api: Pick<PlatformApi, "request">;
  kids: Pick<KidStore, "getState">;
  storage: DeviceStorage;
}

export interface CompanionPresence {
  /** The kid's toggle as the client knows it (a parked toggle beats the cached row). */
  isPersisted(kidId: string, field: PresenceField): boolean;
  /**
   * Persist a deliberate toggle so it survives reconnects AND reloads. The local
   * cache and the outbox are written synchronously, then the PATCH is tried.
   * No-ops when the value already matches.
   */
  persist(field: PresenceField, on: boolean, kidId: string | null): void;
  /** Resolve both targets for one bring-up from the kid row (see resolveField). */
  resolveStart(kidId: string): Promise<{ startDeaf: boolean; startMuted: boolean }>;
  /** Retry every parked toggle for this kid (endSession / unload). */
  flushAll(kidId: string): void;
}

export function createCompanionPresence(deps: PresenceDeps): CompanionPresence {
  const { api, kids, storage } = deps;

  const outboxKey = (kidId: string, field: PresenceField): string =>
    `${PRESENCE_OUTBOX_PREFIX[field]}${kidId}`;

  // Fallback for storage that throws (private mode, at quota). Keyed by
  // `${field}:${kidId}`. Only populated when the durable write failed, so
  // storage stays the single source of truth on the normal path.
  const fallback = new Map<string, string | null>();
  const fallbackKey = (kidId: string, field: PresenceField): string => `${field}:${kidId}`;

  /** The unconfirmed toggle for this kid+field, or null when the row is in sync. */
  function readOutbox(kidId: string, field: PresenceField): { value: string | null } | null {
    try {
      const raw = storage.getItem(outboxKey(kidId, field));
      if (raw !== null) {
        const value: unknown = JSON.parse(raw);
        return { value: typeof value === "string" ? value : null };
      }
    } catch {
      // Unreadable: fall through to the in-memory fallback.
    }
    const fk = fallbackKey(kidId, field);
    if (fallback.has(fk)) {
      return { value: fallback.get(fk) ?? null };
    }
    return null;
  }

  function writeOutbox(kidId: string, field: PresenceField, value: string | null): void {
    const fk = fallbackKey(kidId, field);
    try {
      storage.setItem(outboxKey(kidId, field), JSON.stringify(value));
      fallback.delete(fk);
    } catch {
      fallback.set(fk, value);
    }
  }

  /**
   * Send the kid's parked toggle, clearing the outbox only once it actually
   * lands. Toggling is typically the last thing a kid does before navigating or
   * closing the app, so the request is `keepalive`: without it the browser
   * cancels it on unload and the toggle silently reverts on the next load.
   */
  async function flushOutbox(kidId: string, field: PresenceField): Promise<void> {
    const parked = readOutbox(kidId, field);
    if (!parked) return;

    try {
      const res = await api.request(`/api/kids/${kidId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: parked.value }),
        keepalive: true,
      });
      // `request` resolves for 4xx/5xx too: an unchecked response would drop
      // a toggle the server never stored.
      if (!res.ok) return;
    } catch {
      return; // offline / aborted: retried on the next bring-up
    }

    // Only drop it if the kid hasn't toggled again while this was in flight.
    const still = readOutbox(kidId, field);
    if (!still || still.value !== parked.value) return;
    fallback.delete(fallbackKey(kidId, field));
    try {
      storage.removeItem(outboxKey(kidId, field));
    } catch {
      // Nothing to do: a redundant re-send is harmless.
    }
  }

  function isPersisted(kidId: string, field: PresenceField): boolean {
    const parked = readOutbox(kidId, field);
    if (parked) return parked.value != null;
    const cached = kids.getState().byId?.[kidId]?.[field] ?? null;
    return cached != null;
  }

  /**
   * One field for a bring-up: a parked toggle wins (more recent intent), then
   * the cached row, then a fresh load. `fallbackWhenUnreachable` answers when
   * the row can't be read (offline, cold cache).
   */
  async function resolveField(
    kidId: string,
    field: PresenceField,
    fallbackWhenUnreachable: boolean,
  ): Promise<boolean> {
    const parked = readOutbox(kidId, field);
    if (parked) {
      void flushOutbox(kidId, field);
      return parked.value != null;
    }

    const store = kids.getState();
    const cached = store.byId?.[kidId];
    if (cached) return cached[field] != null;

    try {
      const kid = await store.loadOne(kidId);
      return kid?.[field] != null;
    } catch {
      return fallbackWhenUnreachable;
    }
  }

  return {
    isPersisted,

    persist(field, on, kidId) {
      if (!kidId) return;
      if (isPersisted(kidId, field) === on) return;

      const value = on ? new Date().toISOString() : null;
      kids.getState().patchLocal?.(kidId, { [field]: value } as Partial<Kid>);
      writeOutbox(kidId, field, value);
      void flushOutbox(kidId, field);
    },

    async resolveStart(kidId) {
      const [startDeaf, startMuted] = await Promise.all([
        // Unreachable row ⇒ come up deaf rather than guessing "listening": a
        // failed read must never unmute a kid who deafened dodi (a tap wakes her).
        resolveField(kidId, "deafened_dodi_at", true),
        // ...but do NOT guess muted: wrongly muting would silently break game
        // audio with no visible cause, so an unreadable row comes up unmuted.
        resolveField(kidId, "muted_dodi_at", false),
      ]);
      return { startDeaf, startMuted };
    },

    flushAll(kidId) {
      void flushOutbox(kidId, "deafened_dodi_at");
      void flushOutbox(kidId, "muted_dodi_at");
    },
  };
}
