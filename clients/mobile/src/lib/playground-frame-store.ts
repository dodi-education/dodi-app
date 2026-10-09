import { create } from "zustand";

/**
 * Where the Playground panel starts on screen (window y of its top edge).
 * The kid home's stage measures it; the kid chrome draws the panel in its own
 * overlay layer, above the bottom nav (React Native layers only siblings, so
 * a panel inside the page could never cover the nav).
 */
interface PlaygroundFrameState {
  panelTop: number | null;
  setPanelTop: (top: number | null) => void;
}

export const usePlaygroundFrameStore = create<PlaygroundFrameState>()((set) => ({
  panelTop: null,
  setPanelTop: (panelTop) => set({ panelTop }),
}));
