import { describe, expect, it } from "vitest";

import { aggregateMonthly, type UsageRow } from "./usage";

const row = (o: Partial<UsageRow>): UsageRow => ({
  event_type: "game_create",
  provider: "anthropic",
  model: "claude-opus-4-8",
  kid_id: "kid-1",
  input_tokens: 0,
  output_tokens: 0,
  cache_write_tokens: 0,
  cache_read_tokens: 0,
  voice_seconds: null,
  ...o,
});

describe("aggregateMonthly", () => {
  const rows: UsageRow[] = [
    row({ event_type: "game_create", model: "claude-opus-4-8", output_tokens: 3000 }),
    row({ event_type: "game_edit", model: "claude-opus-4-8" }),
    row({ event_type: "game_create", model: "claude-haiku-4-5-20251001", kid_id: "kid-2" }),
    row({ event_type: "game_analysis", model: "gemini-3.5-flash", provider: "gemini", kid_id: "kid-2" }),
    row({ event_type: "voice_minutes", provider: "gemini", model: "gemini-3.1-flash-live-preview", voice_seconds: 600, kid_id: "kid-1" }),
  ];
  const agg = aggregateMonthly(rows);

  it("counts create + edit per model (analysis excluded)", () => {
    expect(agg.gamesByModel["claude-opus-4-8"]).toBe(2);
    expect(agg.gamesByModel["claude-haiku-4-5-20251001"]).toBe(1);
    expect(agg.gamesByModel["gemini-3.5-flash"]).toBeUndefined();
  });

  it("sums voice seconds", () => {
    expect(agg.voiceSeconds).toBe(600);
  });

  it("rolls up per-model token + event counts", () => {
    const opus = agg.perModel.find((m) => m.model === "claude-opus-4-8")!;
    expect(opus.creates).toBe(1);
    expect(opus.edits).toBe(1);
    expect(opus.outputTokens).toBe(3000);
  });

  it("splits usage per kid", () => {
    const kid1 = agg.perKid.find((k) => k.kidId === "kid-1")!;
    expect(kid1.games).toBe(2);
    expect(kid1.voiceSeconds).toBe(600);
    const kid2 = agg.perKid.find((k) => k.kidId === "kid-2")!;
    expect(kid2.games).toBe(1);
  });
});
