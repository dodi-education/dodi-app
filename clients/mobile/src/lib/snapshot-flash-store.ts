import { create } from "zustand";
import type { SnapshotFlashRect } from "@dodi/ui-recipes";

/** One snapshot flash, all in window coordinates, decided before it shows. */
export interface SnapshotFlashRequest {
  id: number;
  /** The captured game image (data URL). */
  image: string;
  /** The game stage at capture time: the animation start. */
  startRect: SnapshotFlashRect;
  /** The landing card above the Snapshots nav item. */
  target: SnapshotFlashRect;
  /** Fixed for the flash's whole life (a later OS change never restarts it). */
  isReducedMotion: boolean;
}

interface SnapshotFlashState {
  flash: SnapshotFlashRequest | null;
}

let nextId = 1;

/**
 * The flash currently on screen. The game view requests it; the kid chrome's
 * full-window `SnapshotFlashHost` renders it above the page and the nav (the
 * web's fixed overlay), since the landing spot lies outside the game view.
 */
export const useSnapshotFlashStore = create<SnapshotFlashState>(() => ({ flash: null }));

/** Shows a flash (replacing any running one); returns its id. */
export function showSnapshotFlash(request: Omit<SnapshotFlashRequest, "id">): number {
  const id = nextId++;
  useSnapshotFlashStore.setState({ flash: { ...request, id } });
  return id;
}

/** Removes the flash `id`, if it is still the one showing. */
export function clearSnapshotFlash(id: number): void {
  if (useSnapshotFlashStore.getState().flash?.id === id) useSnapshotFlashStore.setState({ flash: null });
}
