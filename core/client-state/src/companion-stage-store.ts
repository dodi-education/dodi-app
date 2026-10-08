/**
 * The companion on screen, as the kid view drives it: the Playground (open or
 * not, which panel, a look being tried on before it is saved) and tricks
 * requested from the UI or by voice. The 3D renderer subscribes: it applies
 * the look, plays requested tricks and reports how they ended
 * (`settleTrick`), and says whether the 3D character is showing at all
 * (tricks need it).
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import type { CompanionLook } from "@dodi/character/character-look";
import type { MotionScript } from "@dodi/character/motion-script";

export type PlaygroundPanel = "look" | "tricks" | "teach";

/** A trick ready to play: a built-in's or custom trick's script. */
export interface StageTrick {
  /** Built-in trick id or custom trick id ("preview" for an unsaved one). */
  id: string;
  name: string;
  script: MotionScript;
}

/** How a requested trick ended (the renderer's TrickOutcome, or never played). */
export type StageTrickOutcome = "done" | "interrupted" | "reduced-motion" | "unavailable";

export interface TrickRequest {
  nonce: number;
  trick: StageTrick;
}

export interface CompanionStageState {
  isPlaygroundOpen: boolean;
  panel: PlaygroundPanel;
  /** A look being tried on (unsaved); null shows the companion's saved look. */
  previewLook: CompanionLook | null;
  /** The latest trick to play; the renderer plays each nonce once. */
  trickRequest: TrickRequest | null;
  /** The trick playing now (its id), for the UI. */
  playingTrickId: string | null;
  /** The 3D character is on screen (and can play tricks). */
  isCharacterShown: boolean;
  /** A trick is being learned (the character shows its thinking pose). */
  isLearningTrick: boolean;

  openPlayground: (panel?: PlaygroundPanel) => void;
  closePlayground: () => void;
  setPanel: (panel: PlaygroundPanel) => void;
  setPreviewLook: (look: CompanionLook | null) => void;
  /** Play a trick; resolves when it ends (at once with "unavailable" without a 3D character). */
  requestTrick: (trick: StageTrick) => Promise<StageTrickOutcome>;
  /** The renderer reports how a requested trick ended. */
  settleTrick: (nonce: number, outcome: StageTrickOutcome) => void;
  setCharacterShown: (isShown: boolean) => void;
  /** Wrap a trick being learned: the character thinks until it settles, even on throw. */
  whileLearning: <T>(work: () => Promise<T>) => Promise<T>;
}

export type CompanionStageStore = StoreApi<CompanionStageState>;

export function createCompanionStageStore(): CompanionStageStore {
  let nonce = 0;
  let learning = 0;
  const pending = new Map<number, (outcome: StageTrickOutcome) => void>();

  const settleAll = (outcome: StageTrickOutcome): void => {
    for (const resolve of pending.values()) resolve(outcome);
    pending.clear();
  };

  return createStore<CompanionStageState>()((set, get) => ({
    isPlaygroundOpen: false,
    panel: "look",
    previewLook: null,
    trickRequest: null,
    playingTrickId: null,
    isCharacterShown: false,
    isLearningTrick: false,

    openPlayground: (panel) => set({ isPlaygroundOpen: true, ...(panel ? { panel } : {}) }),
    closePlayground: () => set({ isPlaygroundOpen: false, previewLook: null }),
    setPanel: (panel) => set({ panel }),
    setPreviewLook: (previewLook) => set({ previewLook }),

    requestTrick: (trick) => {
      if (!get().isCharacterShown) return Promise.resolve("unavailable");
      nonce += 1;
      const request = { nonce, trick };
      return new Promise<StageTrickOutcome>((resolve) => {
        pending.set(request.nonce, resolve);
        set({ trickRequest: request, playingTrickId: trick.id });
      });
    },

    settleTrick: (requestNonce, outcome) => {
      const resolve = pending.get(requestNonce);
      pending.delete(requestNonce);
      resolve?.(outcome);
      if (get().trickRequest?.nonce === requestNonce) set({ playingTrickId: null });
    },

    whileLearning: async (work) => {
      learning += 1;
      set({ isLearningTrick: true });
      try {
        return await work();
      } finally {
        learning -= 1;
        set({ isLearningTrick: learning > 0 });
      }
    },

    setCharacterShown: (isCharacterShown) => {
      if (!isCharacterShown) {
        settleAll("unavailable");
        set({ isCharacterShown, trickRequest: null, playingTrickId: null });
        return;
      }
      set({ isCharacterShown });
    },
  }));
}
