import { describe, expect, it } from "vitest";

import { BACKFLIP } from "@dodi/character/tricks/dodi";

import { createCompanionStageStore } from "./companion-stage-store";

const TRICK = { id: "backflip", name: "Backflip", script: BACKFLIP };

describe("companion stage store", () => {
  it("answers unavailable while no 3D character shows", async () => {
    const store = createCompanionStageStore();
    await expect(store.getState().requestTrick(TRICK)).resolves.toBe("unavailable");
    expect(store.getState().trickRequest).toBeNull();
  });

  it("hands a trick to the renderer and resolves when it reports back", async () => {
    const store = createCompanionStageStore();
    store.getState().setCharacterShown(true);
    const outcome = store.getState().requestTrick(TRICK);
    const request = store.getState().trickRequest!;
    expect(request.trick.id).toBe("backflip");
    expect(store.getState().playingTrickId).toBe("backflip");
    store.getState().settleTrick(request.nonce, "done");
    await expect(outcome).resolves.toBe("done");
    expect(store.getState().playingTrickId).toBeNull();
  });

  it("settles pending tricks when the character goes away", async () => {
    const store = createCompanionStageStore();
    store.getState().setCharacterShown(true);
    const outcome = store.getState().requestTrick(TRICK);
    store.getState().setCharacterShown(false);
    await expect(outcome).resolves.toBe("unavailable");
  });

  it("drops the tried-on look when the Playground closes", () => {
    const store = createCompanionStageStore();
    store.getState().openPlayground("tricks");
    expect(store.getState()).toMatchObject({ isPlaygroundOpen: true, panel: "tricks" });
    store.getState().setPreviewLook({ v: 1, model: "dodi", colors: {}, accessories: ["glasses"] });
    store.getState().closePlayground();
    expect(store.getState()).toMatchObject({ isPlaygroundOpen: false, previewLook: null });
  });
});

describe("learning flag", () => {
  it("is on while a trick is learned, even when learning fails", async () => {
    const store = createCompanionStageStore();
    let during = false;
    await store.getState().whileLearning(async () => {
      during = store.getState().isLearningTrick;
    });
    expect(during).toBe(true);
    expect(store.getState().isLearningTrick).toBe(false);
    await expect(
      store.getState().whileLearning(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(store.getState().isLearningTrick).toBe(false);
  });
});
