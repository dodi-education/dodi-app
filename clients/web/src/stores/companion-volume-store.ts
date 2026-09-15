/**
 * Per-kid output volume for the companion, persisted to localStorage.
 *
 * Volume is a DEVICE preference (a tablet's speaker and a laptop's differ), so
 * unlike the deaf/mute toggles — which live on the kid row and sync across
 * devices — the loudness level stays local. Full mute is the exception: it is a
 * deliberate "no sound at all" that should follow the kid everywhere, so it
 * lives on kids.muted_dodi_at (see dodi-session-store `setMuted`), not here.
 *
 * Manual localStorage (no persist middleware), matching the repo's store
 * convention. The session store subscribes to this store and pushes the level
 * into the live AudioStreamer's master gain.
 */
import { create } from "zustand";

const VOLUME_KEY_PREFIX = "dodi-volume-"; // per kid: dodi-volume-<kidId>
const DEFAULT_VOLUME = 1;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function clampVolume(volume: number): number {
  if (Number.isNaN(volume)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, volume));
}

/** The persisted level for a kid (default 1; SSR/private-mode safe). */
export function readKidVolume(kidId: string): number {
  if (!hasWindow()) return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(`${VOLUME_KEY_PREFIX}${kidId}`);
    if (raw === null) return DEFAULT_VOLUME;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampVolume(parsed) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function persistKidVolume(kidId: string, volume: number): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(`${VOLUME_KEY_PREFIX}${kidId}`, String(volume));
  } catch {
    // Private mode / quota — volume degrades to per-page-load.
  }
}

interface CompanionVolumeState {
  /** The kid this store is currently bound to (drives which key persists). */
  kidId: string | null;
  /** Output volume for the bound kid, 0..1. */
  volume: number;
  /** Bind to a kid and load their persisted level (call on connect). */
  bindKid: (kidId: string) => void;
  /** Set the bound kid's volume: clamps, persists, and notifies subscribers. */
  setVolume: (volume: number) => void;
}

export const useCompanionVolumeStore = create<CompanionVolumeState>((set, get) => ({
  kidId: null,
  volume: DEFAULT_VOLUME,

  bindKid: (kidId) => {
    if (get().kidId === kidId) return;
    set({ kidId, volume: readKidVolume(kidId) });
  },

  setVolume: (volume) => {
    const clamped = clampVolume(volume);
    const { kidId } = get();
    if (kidId) persistKidVolume(kidId, clamped);
    set({ volume: clamped });
  },
}));
