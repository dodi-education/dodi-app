import { describe, expect, it } from "vitest";

import {
  findInvalidSettings,
  invalidSettingsList,
  planSettingsSave,
  resolveDraftGate,
} from "./settings-save";

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

describe("findInvalidSettings", () => {
  const valid = {
    title: "Counting stars",
    learningGoal: "Count to ten",
    targetAgeMin: 4,
    targetAgeMax: 8,
    primaryKidId: "kid-1",
    isPlanning: true,
  };

  it("passes a complete form", () => {
    const invalid = findInvalidSettings(valid);
    expect(invalid).toEqual({ title: false, learningGoal: false, audience: false, age: false });
    expect(invalidSettingsList(invalid)).toBe("");
  });

  it("requires a title only while planning", () => {
    expect(findInvalidSettings({ ...valid, title: "  " }).title).toBe(true);
    expect(findInvalidSettings({ ...valid, title: "", isPlanning: false }).title).toBe(false);
  });

  it("flags a missing goal, a missing audience and a bad age range", () => {
    const invalid = findInvalidSettings({
      ...valid,
      learningGoal: " ",
      primaryKidId: null,
      targetAgeMin: 9,
      targetAgeMax: 5,
    });
    expect(invalid).toEqual({ title: false, learningGoal: true, audience: true, age: true });
    expect(invalidSettingsList(invalid)).toBe("learningGoal,audience,age");
  });
});
