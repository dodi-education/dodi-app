import { describe, expect, it } from "vitest";

import {
  type AgentRunEvent,
  type AgentRunLog,
  boundRunLogs,
  formatRunClock,
  reduceAgentRun,
  restoreRunLog,
  runChecks,
  startAgentRun,
} from "@/lib/games/agent-run-log";

const T0 = 1_000_000;

function play(events: [AgentRunEvent, number][]): AgentRunLog {
  return events.reduce(
    (log, [event, at]) => reduceAgentRun(log, event, T0 + at),
    startAgentRun(T0),
  );
}

function check(
  frames: number,
  extra: Partial<{ ready: boolean; layoutIssues: string[] }> = {},
): AgentRunEvent {
  return {
    type: "check",
    check: {
      requestedSteps: ["tap start"],
      output: {
        frames: Array.from({ length: frames }, (_, i) => ({
          label: `frame ${i}`,
          image: `data:image/jpeg;base64,t${i}`,
          fullImage: `data:image/jpeg;base64,full${i}`,
        })),
        ready: extra.ready ?? true,
        errors: [],
        warnings: [],
        ...(extra.layoutIssues ? { layoutIssues: extra.layoutIssues } : {}),
      },
    },
  };
}

describe("reduceAgentRun", () => {
  it("records one narration entry per block, trimmed, skipping empty blocks", () => {
    const log = play([
      [{ type: "narration_start" }, 0],
      [{ type: "narration_delta", text: "  I will " }, 10],
      [{ type: "narration_delta", text: "write it. " }, 20],
      [{ type: "narration_start" }, 100],
      [{ type: "narration_delta", text: "   " }, 110],
      [{ type: "narration_start" }, 200],
      [{ type: "narration_delta", text: "Now checking." }, 210],
      [{ type: "finish", outcome: "completed" }, 5_000],
    ]);
    expect(log.entries).toEqual([
      { kind: "narration", atMs: 0, text: "I will write it." },
      { kind: "narration", atMs: 200, text: "Now checking." },
    ]);
    expect(log.durationMs).toBe(5_000);
    expect(log.outcome).toBe("completed");
  });

  it("collapses consecutive duplicate steps but keeps repeats after other entries", () => {
    const log = play([
      [{ type: "step", step: "writing_code" }, 0],
      [{ type: "step", step: "writing_code" }, 5],
      [{ type: "step", step: "validating" }, 10],
      [{ type: "narration_start" }, 11],
      [{ type: "step", step: "validating" }, 12],
      [{ type: "step", step: "writing_code" }, 20],
    ]);
    expect(
      log.entries.map((e) => (e.kind === "step" ? e.step : e.kind)),
    ).toEqual(["writing_code", "validating", "writing_code"]);
  });

  it("records screenshot checks, including failed renders and layout issues", () => {
    const log = play([
      [
        check(2, { layoutIssues: ["Score covers the Start button (frame 1)"] }),
        50,
      ],
      [{ type: "check", check: { requestedSteps: [], output: null } }, 90],
    ]);
    const [ok, failed] = runChecks(log);
    expect(ok.frames).toHaveLength(2);
    expect(ok.isReady).toBe(true);
    expect(ok.hasFailed).toBe(false);
    expect(ok.layoutIssues).toEqual([
      "Score covers the Start button (frame 1)",
    ]);
    expect(ok.requestedSteps).toEqual(["tap start"]);
    expect(failed.hasFailed).toBe(true);
    expect(failed.frames).toEqual([]);
    expect(failed.layoutIssues).toEqual([]);
  });

  it("freezes a finished run", () => {
    const done = play([[{ type: "finish", outcome: "stopped" }, 10]]);
    expect(
      reduceAgentRun(done, { type: "step", step: "validating" }, T0 + 20),
    ).toBe(done);
  });
});

describe("boundRunLogs", () => {
  const run = play([
    [check(3), 10],
    [check(2), 20],
    [{ type: "finish", outcome: "completed" }, 30],
  ]);
  const messages = [
    { text: "a", run },
    { text: "plain" },
    { text: "b", run },
    { text: "c", run },
  ];

  it("keeps thumbnails only on the trailing runs and never seals full images", () => {
    const bounded = boundRunLogs(messages, {
      runsWithFrames: 2,
      framesPerRun: 10,
    });
    expect(bounded[1]).toBe(messages[1]);
    const oldest = runChecks(bounded[0].run!);
    expect(
      oldest.every((c) => c.frames.length === 0 && c.hasDroppedFrames),
    ).toBe(true);
    for (const m of [bounded[2], bounded[3]]) {
      const frames = runChecks(m.run!).flatMap((c) => c.frames);
      expect(frames).toHaveLength(5);
      expect(frames.every((f) => f.fullImage === undefined)).toBe(true);
    }
    // the in-memory messages are untouched
    expect(runChecks(messages[3].run!)[0].frames[0].fullImage).toBeDefined();
  });

  it("caps frames per run, favouring the latest checks", () => {
    const bounded = boundRunLogs(messages, {
      runsWithFrames: 1,
      framesPerRun: 3,
    });
    const [first, second] = runChecks(bounded[3].run!);
    expect(second.frames).toHaveLength(2);
    expect(first.frames).toHaveLength(1);
    expect(first.hasDroppedFrames).toBe(true);
  });
});

describe("restoreRunLog", () => {
  it("round-trips a sealed log through JSON", () => {
    const log = play([
      [{ type: "step", step: "visual_check" }, 1],
      [check(1), 2],
      [{ type: "finish", outcome: "validation_failed" }, 3],
    ]);
    const restored = restoreRunLog(
      JSON.parse(JSON.stringify(boundRunLogs([{ run: log }])[0].run)),
    );
    expect(restored?.outcome).toBe("validation_failed");
    expect(restored?.entries).toHaveLength(2);
  });

  it("tolerates old transcripts and malformed data", () => {
    expect(restoreRunLog(undefined)).toBeUndefined();
    expect(restoreRunLog({ entries: [] })).toBeUndefined();
    const partial = restoreRunLog({
      startedAt: 1,
      outcome: "bogus",
      entries: [
        { kind: "step", atMs: 0, step: "validating" },
        { kind: "check", atMs: 1 },
        null,
      ],
    });
    expect(partial?.outcome).toBeUndefined();
    expect(partial?.entries).toEqual([
      { kind: "step", atMs: 0, step: "validating" },
    ]);
  });
});

describe("formatRunClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatRunClock(0)).toBe("0:00");
    expect(formatRunClock(7_400)).toBe("0:07");
    expect(formatRunClock(72_000)).toBe("1:12");
  });
});
