import { describe, expect, it } from "vitest";

import type { AccountModelConfig } from "@dodi/types/ai";
import type { Kid } from "@dodi/types/database";

import {
  kidGlanceItems,
  loadDashboardStats,
  loadModelConfig,
  needsAiSetup,
} from "./dashboard";

function api(response: Response | Error): { request: () => Promise<Response> } {
  return {
    request: async () => {
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const CONFIG: AccountModelConfig = {
  voiceProvider: "gemini",
  voiceModel: "m",
  voiceName: "v",
};

describe("dashboard data", () => {
  it("loads the stats, null on failure", async () => {
    const stats = { sessionsToday: 1, sessionsThisWeek: 3, gamesCreated: 2 };
    await expect(loadDashboardStats(api(json(stats)))).resolves.toEqual(stats);
    await expect(loadDashboardStats(api(json({}, 500)))).resolves.toBeNull();
    await expect(loadDashboardStats(api(new Error("offline")))).resolves.toBeNull();
  });

  it("loads the model config, null when unsaved or failing", async () => {
    await expect(loadModelConfig(api(json(CONFIG)))).resolves.toEqual(CONFIG);
    await expect(loadModelConfig(api(json(null)))).resolves.toBeNull();
    await expect(loadModelConfig(api(json({}, 401)))).resolves.toBeNull();
    await expect(loadModelConfig(api(new Error("offline")))).resolves.toBeNull();
  });

  it("asks for AI setup only once both sources loaded and neither has a provider", () => {
    expect(needsAiSetup(null, CONFIG)).toBeNull();
    expect(needsAiSetup({}, undefined)).toBeNull();
    expect(needsAiSetup({}, null)).toBe(true);
    expect(needsAiSetup({}, CONFIG)).toBe(true);
    expect(needsAiSetup({ gemini: { apiKey: "k" } } as never, null)).toBe(false);
    expect(needsAiSetup({}, { ...CONFIG, gameProvider: "dodi" })).toBe(false);
  });

  it("derives the glance rows", () => {
    const kids = [
      {
        id: "k1",
        display_name: "mia",
        birthdate: "2018-03-01",
        language: "de",
        active_persona: { id: "p1", name: "Explorer" },
      },
      { id: "k2", display_name: "Ben", birthdate: null, language: "en", active_persona: null },
    ] as unknown as Kid[];
    expect(kidGlanceItems(kids)).toEqual([
      {
        id: "k1",
        name: "mia",
        initial: "M",
        birthdate: "2018-03-01",
        languageLabel: "DE",
        personaName: "Explorer",
        colorIndex: 0,
      },
      {
        id: "k2",
        name: "Ben",
        initial: "B",
        birthdate: null,
        languageLabel: "EN",
        personaName: null,
        colorIndex: 1,
      },
    ]);
  });
});
