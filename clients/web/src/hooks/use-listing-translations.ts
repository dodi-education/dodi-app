"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ListingText } from "@/lib/ai/client-translate-game";
import { fetchKnownListings, saveListingDraft } from "@/lib/games/publication-listings";

export interface ListingTranslations {
  /** Known listing texts per locale, with unsaved edits. Empty until loaded or when none exist. */
  entries: Record<string, ListingText>;
  isDirty: boolean;
  setEntry: (locale: string, entry: ListingText) => void;
  /** Seal the edits into the publication draft. No-op when nothing changed. */
  save: () => Promise<void>;
}

/**
 * Editable form state for the studio's "Translations" settings section: the
 * per-locale Discover listing texts made at publish time. Loads once per game
 * when `enabled` (the settings tab is open); `save` runs as part of the
 * settings save, and the next (re)submit picks the edits up from the draft.
 */
export function useListingTranslations(
  gameId: string | null,
  enabled: boolean,
): ListingTranslations {
  const [entries, setEntries] = useState<Record<string, ListingText>>({});
  const [saved, setSaved] = useState<Record<string, ListingText>>({});
  const loadedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !gameId || loadedForRef.current === gameId) return;
    loadedForRef.current = gameId;
    let cancelled = false;
    let isSettled = false;
    fetchKnownListings(gameId)
      .then((known) => {
        if (cancelled) return;
        setEntries(known);
        setSaved(known);
      })
      .catch(() => {
        // Retry on the next visit to the settings tab.
        if (!cancelled) loadedForRef.current = null;
      })
      .finally(() => {
        isSettled = true;
      });
    return () => {
      cancelled = true;
      // Interrupted mid-load (strict-mode remount, game switch): load again.
      if (!isSettled) loadedForRef.current = null;
    };
  }, [gameId, enabled]);

  const isDirty = JSON.stringify(entries) !== JSON.stringify(saved);

  const setEntry = useCallback((locale: string, entry: ListingText) => {
    setEntries((current) => ({ ...current, [locale]: entry }));
  }, []);

  const save = useCallback(async () => {
    if (!gameId || !isDirty) return;
    await saveListingDraft(gameId, entries);
    setSaved(entries);
  }, [gameId, isDirty, entries]);

  return { entries, isDirty, setEntry, save };
}
