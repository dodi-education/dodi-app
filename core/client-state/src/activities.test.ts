import { describe, expect, it } from "vitest";

import { encryptPersonaFields } from "@dodi/vault/persona-crypto";

import {
  ACTIVITIES_PAGE_SIZE,
  NO_ACTIVITY_FILTERS,
  activitiesPath,
  activityBadgeVariant,
  activityEventLabel,
  activityTitle,
  isUnfiltered,
  loadActivities,
  loadPersonaOptions,
} from "./activities";
import { json, routedApi, unlockedVault } from "./parent-pages.test-support";
import { loadUsage, minutesOf, prettyModel, usageSummary } from "./usage";

describe("activities", () => {
  it("builds the page query from the filters", () => {
    expect(activitiesPath(NO_ACTIVITY_FILTERS, 0)).toBe("/api/activities?limit=50&offset=0");
    expect(activitiesPath({ kidId: "k1", personaId: "all", event: "game_started" }, 50)).toBe(
      "/api/activities?kidId=k1&event=game_started&limit=50&offset=50",
    );
    expect(isUnfiltered(NO_ACTIVITY_FILTERS)).toBe(true);
    expect(isUnfiltered({ ...NO_ACTIVITY_FILTERS, personaId: "p" })).toBe(false);
  });

  it("pages: hasMore only when a page came back full", async () => {
    const full = Array.from({ length: ACTIVITIES_PAGE_SIZE }, (_, i) => ({ id: String(i) }));
    const api = routedApi({ "/api/activities?limit=50&offset=0": json(full) });
    await expect(loadActivities(api, NO_ACTIVITY_FILTERS, 0)).resolves.toMatchObject({ hasMore: true });
    const short = routedApi({ "/api/activities?limit=50&offset=0": json([{ id: "a" }]) });
    await expect(loadActivities(short, NO_ACTIVITY_FILTERS, 0)).resolves.toMatchObject({ hasMore: false });
    const failing = routedApi({ "/api/activities?limit=50&offset=0": json({}, 500) });
    await expect(loadActivities(failing, NO_ACTIVITY_FILTERS, 0)).rejects.toThrow();
  });

  it("labels events, picks badges and titles rows by decrypted game name", () => {
    const t = (k: string) => `t:${k}`;
    expect(activityEventLabel("game_command_failed", t)).toBe("t:gameCommandFailed");
    expect(activityEventLabel("custom_event", t)).toBe("custom_event");
    expect(activityBadgeVariant("session_start")).toBe("blue");
    expect(activityBadgeVariant("game_command_failed")).toBe("destructive");
    expect(activityBadgeVariant("snapshot_created")).toBe("gray");
    const titles = new Map([["g1", "Space Math"]]);
    expect(activityTitle({ game_id: "g1", message: "Started" }, titles)).toBe("[Space Math] Started");
    expect(activityTitle({ game_id: "g2", message: "Started" }, titles)).toBe("Started");
  });

  it("decrypts the persona filter options", async () => {
    const { session } = unlockedVault();
    const sealed = { id: "p1", account_id: "a", is_system_default: false, ...encryptPersonaFields(session, { name: "Coach", soul: "x" }) };
    const api = routedApi({ "/api/personas": json([sealed]) });
    await expect(loadPersonaOptions(api, session)).resolves.toEqual([{ id: "p1", name: "Coach" }]);
  });
});

describe("usage", () => {
  it("loads the report, null on failure", async () => {
    const data = { perModel: [], perKid: [], gamesByModel: {}, voiceSeconds: 0 };
    await expect(loadUsage(routedApi({ "/api/usage": json(data) }))).resolves.toEqual(data);
    await expect(loadUsage(routedApi({ "/api/usage": json({}, 500) }))).resolves.toBeNull();
    await expect(loadUsage(routedApi({ "/api/usage": new TypeError("offline") }))).resolves.toBeNull();
  });

  it("prettifies model ids and sums the strip", () => {
    expect(prettyModel("claude-opus-4-8-20260101")).toBe("Claude opus-4-8");
    expect(prettyModel("gemini-3-pro")).toBe("Gemini 3-pro");
    expect(prettyModel("mistral-large")).toBe("Mistral large");
    expect(prettyModel("grok-4")).toBe("grok-4");
    const line = { provider: "x", model: "m", creates: 2, edits: 3, plans: 1, analyses: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    expect(usageSummary({ perModel: [line], perKid: [], gamesByModel: {}, voiceSeconds: 150 })).toEqual({
      gamesMade: 5,
      voiceMinutes: 3,
      hasUsage: true,
    });
    expect(usageSummary(null)).toEqual({ gamesMade: 0, voiceMinutes: 0, hasUsage: false });
    expect(minutesOf(89)).toBe(1);
  });
});
