import { describe, expect, it } from "vitest";

import { planSettingsSave, resolveDraftGate } from "./settings-save";

describe("planSettingsSave", () => {
  // Regression: "Save & start building" awaited an AI round trip (success
  // mapping) before leaving the settings form. With no progress shown, a phone
  // user saw nothing happen for a long time, and a backgrounded tab stalled it.
  it("hands off to the agent view first when the save starts a planned build", () => {
    expect(planSettingsSave({ isPlanning: true, hasAcceptedPlan: true })).toEqual({
      isBuildStart: true,
      shouldMapSuccessDefinition: false,
    });
  });

  it("skips the success mapping for a planned build: the first build maps it itself", () => {
    expect(
      planSettingsSave({ isPlanning: true, hasAcceptedPlan: true }).shouldMapSuccessDefinition,
    ).toBe(false);
  });

  it("keeps the success mapping for a plain draft save and for an existing game", () => {
    expect(planSettingsSave({ isPlanning: true, hasAcceptedPlan: false })).toEqual({
      isBuildStart: false,
      shouldMapSuccessDefinition: true,
    });
    expect(planSettingsSave({ isPlanning: false, hasAcceptedPlan: false })).toEqual({
      isBuildStart: false,
      shouldMapSuccessDefinition: true,
    });
  });
});

describe("resolveDraftGate", () => {
  it("locks panes and composer on a planning draft's settings form", () => {
    expect(
      resolveDraftGate({ isPlanning: true, isPlanMode: false, isStartingBuild: false }),
    ).toEqual({ isPaneLocked: true, isComposerLocked: true });
  });

  it("opens the agent view while the build-starting save runs, composer still locked", () => {
    expect(
      resolveDraftGate({ isPlanning: true, isPlanMode: false, isStartingBuild: true }),
    ).toEqual({ isPaneLocked: false, isComposerLocked: true });
  });

  it("locks nothing on the Plan step or past planning", () => {
    expect(
      resolveDraftGate({ isPlanning: true, isPlanMode: true, isStartingBuild: false }),
    ).toEqual({ isPaneLocked: false, isComposerLocked: false });
    expect(
      resolveDraftGate({ isPlanning: false, isPlanMode: false, isStartingBuild: false }),
    ).toEqual({ isPaneLocked: false, isComposerLocked: false });
  });
});
