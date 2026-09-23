import { describe, expect, it } from "vitest";

import type {
  RenderGameInput,
  RenderGameOutput,
} from "@dodi/ai/game-agent-tools";

import { type AgentRunLog, runChecks } from "@/lib/games/agent-run-log";
import { createAgentRunRecorder } from "@/lib/games/agent-run-recorder";

const INPUT: RenderGameInput = {
  code: "<html></html>",
  steps: [{ label: "tap start" }],
};

const OUTPUT: RenderGameOutput = {
  frames: [
    { label: "opening screen", image: "data:big0" },
    { label: "tap start", image: "data:big1" },
  ],
  ready: true,
  warnings: ["slow start"],
  errors: [],
  layoutIssues: ["Score covers Start"],
};

function setup(thumbnail = async (url: string) => url.replace("big", "thumb")) {
  let clock = 0;
  const seen: AgentRunLog[] = [];
  const recorder = createAgentRunRecorder({
    onChange: (log) => seen.push(log),
    thumbnail,
    now: () => (clock += 100),
  });
  return { recorder, seen };
}

describe("createAgentRunRecorder", () => {
  it("records steps, narration and checks, passing the render through untouched", async () => {
    const { recorder, seen } = setup();
    recorder.onStep("writing_code");
    recorder.onActivity({ type: "narration_start" });
    recorder.onActivity({ type: "narration_delta", text: "Looking now." });
    recorder.onActivity({ type: "write_progress", chars: 400 });
    const view = recorder.wrapViewGame(async () => OUTPUT);
    expect(await view(INPUT)).toBe(OUTPUT);
    const log = recorder.finish("completed");

    expect(seen.at(-1)).toBe(log);
    expect(log.entries.map((e) => e.kind)).toEqual([
      "step",
      "narration",
      "check",
    ]);
    const [c] = runChecks(log);
    expect(c.requestedSteps).toEqual(["tap start"]);
    expect(c.frames).toEqual([
      { label: "opening screen", image: "data:thumb0", fullImage: "data:big0" },
      { label: "tap start", image: "data:thumb1", fullImage: "data:big1" },
    ]);
    expect(c.warnings).toEqual(["slow start"]);
    expect(c.layoutIssues).toEqual(["Score covers Start"]);
  });

  it("records a failed render and survives thumbnail failures", async () => {
    const { recorder } = setup(async () => {
      throw new Error("no canvas");
    });
    expect(await recorder.wrapViewGame(async () => null)(INPUT)).toBeNull();
    expect(await recorder.wrapViewGame(async () => OUTPUT)(INPUT)).toBe(OUTPUT);
    const [failed, noThumbs] = runChecks(recorder.finish("failed"));
    expect(failed.hasFailed).toBe(true);
    expect(noThumbs.hasFailed).toBe(false);
    expect(noThumbs.frames).toEqual([]);
  });

  it("logs a render that throws as a failed check and rethrows", async () => {
    const { recorder, seen } = setup();
    const view = recorder.wrapViewGame(async () => {
      throw new Error("down");
    });
    await expect(view(INPUT)).rejects.toThrow("down");
    const [check] = runChecks(seen[seen.length - 1]);
    expect(check.hasFailed).toBe(true);
    expect(check.requestedSteps).toEqual(["tap start"]);
  });
});
