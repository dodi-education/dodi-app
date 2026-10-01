import { describe, expect, it, vi } from "vitest";

import type { DriverTranscript, GameCodeDriver, GameTurn } from "./game-agent-drivers";
import {
  AGENT_CHECKPOINT_VERSION,
  runGameAgent,
  type AgentCheckpoint,
  type RunGameAgentParams,
} from "./game-agent";
import type { AgentTaskRequest } from "@dodi/types/tasks";

vi.mock("./game-agent-drivers", async (importOriginal) => {
  const original = await importOriginal<typeof import("./game-agent-drivers")>();
  return { ...original, createGameDriver: () => mockDriverFactory() };
});

let mockDriverFactory: () => GameCodeDriver;

const TASK: AgentTaskRequest = {
  kidId: "kid-1",
  taskType: "generate_game",
  childContext: { name: "Kid", language: "English" },
  payload: { prompt: "a game" },
};

const FRAME = "data:image/jpeg;base64,RlJBTUU=";

const compliant = (): string =>
  `<!doctype html><html><head><script type="application/dodi-translations">{"sourceLocale":"en","locales":{"en":{"game.title":"Game"}}}</script></head><body><script>
      document.title = dodi.translate('game.title');
      window.addEventListener('message', function (e) {
        if (e.data.type === 'dodi:init') parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*');
        if (e.data.type === 'dodi:command') parent.postMessage({ type: 'game:result' }, '*');
      });
    </script></body></html>`;

/** Every turn bills one input token, so usage proves resumed runs add up exactly. */
const turn = (toolCalls: GameTurn["toolCalls"], hasText = false): GameTurn => ({
  toolCalls,
  text: hasText ? "Done." : "",
  hasText,
  expectsToolResults: toolCalls.length > 0,
  stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
  usage: { inputTokens: 1, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
});
const docsTurn = turn([{ id: "d1", name: "read_bridge_docs", input: {} }]);
const writeTurn = (code: string): GameTurn =>
  turn([
    { id: "w1", name: "write_game_code", input: { code, markdown: "m", title: "T", capabilities: [] } },
  ]);
const editTurn = turn([
  {
    id: "e1",
    name: "edit_game_code",
    input: {
      edits: [
        {
          old_text: "document.title = dodi.translate('game.title');",
          new_text: "document.title = dodi.translate('game.title') + '!';",
        },
      ],
      changeSummary: "- fixed",
    },
  },
]);

/**
 * A driver whose position in the script is derived from its own transcript (one
 * assistant entry per completed turn), so a driver restored from a checkpoint
 * picks up the script exactly where the interrupted one left off. `failAtTurn`
 * simulates the OS killing the build while that turn is in flight.
 */
function transcriptDriver(script: GameTurn[], failAtTurn?: number): GameCodeDriver {
  let messages: Array<{ role: string; text?: string }> = [];
  const completed = (): number => messages.filter((m) => m.role === "assistant").length;
  return {
    seed: (_prior, first) => {
      messages = [{ role: "user", text: typeof first === "string" ? first : first.text }];
    },
    addUserMessage: (content) => {
      messages.push({ role: "user", text: typeof content === "string" ? content : content.text });
    },
    addToolResults: () => {
      messages.push({ role: "tool" });
    },
    snapshot: (): DriverTranscript => ({
      provider: "anthropic",
      messages: JSON.parse(JSON.stringify(messages)) as unknown[],
    }),
    restore: (transcript) => {
      messages = JSON.parse(JSON.stringify(transcript.messages)) as typeof messages;
    },
    runTurn: () => {
      const index = completed();
      if (index === failAtTurn) return Promise.reject(new Error("Connection error."));
      messages.push({ role: "assistant" });
      return Promise.resolve(script[Math.min(index, script.length - 1)]);
    },
  };
}

type ExtraParams = Partial<Omit<RunGameAgentParams, "provider" | "apiKey" | "model" | "task">>;

const params = (extra: ExtraParams = {}): RunGameAgentParams => ({
  provider: "anthropic",
  apiKey: "k",
  model: "m",
  task: TASK,
  ...extra,
});

/** Run once uninterrupted, then again killed at `failAtTurn` and resumed. */
async function runInterruptedAndResumed(
  script: GameTurn[],
  failAtTurn: number,
  makeExtra: () => ExtraParams = () => ({}),
) {
  mockDriverFactory = () => transcriptDriver(script);
  const uninterrupted = await runGameAgent(params(makeExtra()));

  const checkpoints: AgentCheckpoint[] = [];
  mockDriverFactory = () => transcriptDriver(script, failAtTurn);
  await expect(
    runGameAgent(
      params({
        ...makeExtra(),
        onCheckpoint: async (cp) => {
          // Store as the clients will: serialized, so nothing may hold live references.
          checkpoints.push(JSON.parse(JSON.stringify(cp)) as AgentCheckpoint);
        },
      }),
    ),
  ).rejects.toThrow("Connection error.");

  const last = checkpoints[checkpoints.length - 1];
  const resumedExtra = makeExtra();
  mockDriverFactory = () => transcriptDriver(script);
  const resumed = await runGameAgent(params({ ...resumedExtra, resumeFrom: last }));
  return { uninterrupted, resumed, checkpoints, last, resumedExtra };
}

describe("runGameAgent checkpoint / resume", () => {
  it("resumes a main-loop build and finishes exactly like an uninterrupted run", async () => {
    const script = [docsTurn, writeTurn(compliant()), turn([])];
    const { uninterrupted, resumed, last } = await runInterruptedAndResumed(script, 2);

    expect(last).toMatchObject({ version: AGENT_CHECKPOINT_VERSION, phase: "main", phaseTurns: 2 });
    expect(last.lastWrite?.code).toBe(compliant());
    expect(resumed).toEqual(uninterrupted);
    expect(resumed.iterationCount).toBe(3);
    expect(resumed.usage.inputTokens).toBe(3);
  });

  it("resumes inside the validation fix loop without re-asking for the fix", async () => {
    const script = [writeTurn("<html><body>broken</body></html>"), turn([]), writeTurn(compliant())];
    const { uninterrupted, resumed, last } = await runInterruptedAndResumed(script, 2);

    expect(last).toMatchObject({ phase: "validation_fix", phaseTurns: 0 });
    expect(uninterrupted.validationPassed).toBe(true);
    expect(resumed).toEqual(uninterrupted);
    expect(resumed.validationRetries).toBe(1);
  });

  it("resumes inside the forced visual check without rendering again", async () => {
    const script = [writeTurn(compliant()), turn([]), editTurn, turn([], true)];
    const render = () =>
      vi.fn().mockResolvedValue({
        frames: [{ label: "initial", image: FRAME }],
        ready: true,
        warnings: [],
        errors: [],
      });
    const { uninterrupted, resumed, last, resumedExtra } = await runInterruptedAndResumed(
      script,
      3,
      () => ({ onViewGame: render() }),
    );

    expect(last).toMatchObject({ phase: "visual_fix", phaseTurns: 1 });
    expect(resumedExtra.onViewGame).not.toHaveBeenCalled();
    // The edit from before the interruption survives through the restored tool state.
    expect(resumed.codeBundle).toContain("dodi.translate('game.title') + '!'");
    expect(resumed).toEqual(uninterrupted);
  });

  it("checkpoints only plain run state, never the injected callbacks", async () => {
    const checkpoints: AgentCheckpoint[] = [];
    mockDriverFactory = () => transcriptDriver([docsTurn, writeTurn(compliant()), turn([])]);
    await runGameAgent(
      params({
        onGenerateBackgroundImage: vi.fn(),
        onCheckpoint: async (cp) => {
          checkpoints.push(cp);
        },
      }),
    );
    expect(checkpoints.map((cp) => [cp.phase, cp.phaseTurns])).toEqual([
      ["main", 0],
      ["main", 1],
      ["main", 2],
    ]);
    for (const cp of checkpoints) {
      expect(JSON.parse(JSON.stringify(cp))).toEqual(cp);
      expect(Object.values(cp.tools).some((v) => typeof v === "function")).toBe(false);
    }
  });

  it("a failing checkpoint store never fails the build", async () => {
    mockDriverFactory = () => transcriptDriver([docsTurn, writeTurn(compliant()), turn([])]);
    const result = await runGameAgent(
      params({ onCheckpoint: () => Promise.reject(new Error("disk full")) }),
    );
    expect(result.codeBundle).toBe(compliant());
  });

  it("resumes a build interrupted during its very first turn", async () => {
    const script = [docsTurn, writeTurn(compliant()), turn([])];
    const { uninterrupted, resumed, last } = await runInterruptedAndResumed(script, 0);
    expect(last).toMatchObject({ phase: "main", phaseTurns: 0, iterationCount: 0 });
    expect(resumed).toEqual(uninterrupted);
  });

  it("refuses a checkpoint from an unknown format version", async () => {
    mockDriverFactory = () => transcriptDriver([turn([])]);
    const stale = { version: 0 } as unknown as AgentCheckpoint;
    await expect(runGameAgent(params({ resumeFrom: stale }))).rejects.toThrow(/version 0/);
  });
});
