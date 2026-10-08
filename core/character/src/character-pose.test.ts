import { describe, expect, it } from "vitest";

import { characterPoseFor } from "./character-pose";

describe("characterPoseFor", () => {
  it("listens while active and talks with the voice jaw while speaking", () => {
    expect(characterPoseFor({ state: "active", isThinking: false, isSpeaking: false }).clip).toBe("listen");
    const talking = characterPoseFor({ state: "active", isThinking: false, isSpeaking: true });
    expect(talking.clip).toBe("talk");
    expect(talking.hasVoiceJaw).toBe(true);
  });

  it("wears the headphones while deaf, whatever else is going on", () => {
    const pose = characterPoseFor({ state: "deaf", isThinking: true, isSpeaking: true });
    expect(pose.clip).toBe("deaf");
    expect(pose.accessories).toEqual(["headphones"]);
    expect(pose.hasVoiceJaw).toBe(false);
  });

  it("sleeps when asleep or disconnected", () => {
    expect(characterPoseFor({ state: "sleep", isThinking: false, isSpeaking: false }).clip).toBe("sleep");
    expect(characterPoseFor({ state: "disconnected", isThinking: true, isSpeaking: false }).clip).toBe("sleep");
  });

  it("thinks over talking while awake, and idles while connecting", () => {
    expect(characterPoseFor({ state: "active", isThinking: true, isSpeaking: true }).clip).toBe("think");
    expect(characterPoseFor({ state: "connecting", isThinking: false, isSpeaking: false }).clip).toBe("idle");
  });

  it("wears nothing outside the deaf state", () => {
    for (const state of ["active", "sleep", "connecting", "disconnected"] as const) {
      expect(characterPoseFor({ state, isThinking: false, isSpeaking: false }).accessories).toEqual([]);
    }
  });
});

describe("learning a trick", () => {
  it("thinks over every voice state, deaf and asleep included", () => {
    for (const state of ["disconnected", "connecting", "active", "deaf", "sleep"] as const) {
      expect(characterPoseFor({ state, isThinking: false, isSpeaking: true, isLearning: true }).clip).toBe("think");
    }
  });
});
