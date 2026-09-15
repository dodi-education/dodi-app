/**
 * Game PLAN agent — the studio's brainstorming step, before any code exists.
 *
 * Runs fully in the browser on the same drivers as the coding agent (so the
 * provider key never leaves the unlocked vault, and photos/sketches ride along
 * as image content parts). It is a short conversation, not an agentic build:
 * the model chats with the parent and calls exactly one tool, `propose_plan`,
 * to put a plan summary on the table. Nothing is executed and nothing is
 * persisted here — the caller shows the summary, lets the parent edit it, and
 * hands the approved text to `runGameAgent` as the build brief.
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { AgentActivityEvent } from "@dodi/types/agent-progress";
import type { AIProviderId } from "@dodi/types/ai";
import type { GamePlan } from "@dodi/types/plan";
import type { TokenUsage } from "@dodi/types/usage";

import { AgentAbortedError, trimPriorImages } from "./game-agent";
import {
  createGameDriver,
  type GameTurn,
  type PriorTurn,
  type UserContent,
} from "./game-agent-drivers";
import { buildPlanSystemPrompt } from "./game-plan-prompt";
import { getModelOutputCap } from "./providers";

/**
 * The plan agent's only tool. It records a proposal for the parent to review —
 * there is nothing to execute, so its result just acknowledges the hand-off.
 */
export const PROPOSE_PLAN_TOOL: Anthropic.Tool = {
  name: "propose_plan",
  description:
    "Put a game plan in front of the parent for review. Call this as soon as you have a " +
    "concrete idea, and again with the COMPLETE revised summary whenever anything changes. " +
    "The parent reads, edits and approves this text, and the approved version is what gets built.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "The full plan summary in the parent's language: 120-250 words, bold section labels " +
          "(Goal, How it plays, Rules and feedback, Progression, What your child learns, Look " +
          "and feel) each followed by '- ' bullets. Non-technical — describe the experience, " +
          "never the implementation.",
      },
    },
    required: ["summary"],
  },
};

/**
 * A plan exchange is one reply, occasionally two (a tool call, then the
 * sentence about it). The cap exists so a confused model cannot spin; the
 * output cap is small because a plan is prose, not a game bundle.
 */
export const PLAN_LIMITS = {
  MAX_TURNS: 3,
  MAX_TOKENS: 4_096,
} as const;

export interface PlanChildContext {
  age?: number;
  /** Display name of the child's language for prose (e.g. "German"). */
  language: string;
  /** Learning memory + parent notes for the audience kid(s), assembled client-side. */
  learningContext?: string;
}

export interface RunPlanAgentParams {
  /** Agentic (tool-use) provider — the account's game model (anthropic | xai). */
  provider: AIProviderId;
  /** Vault-decrypted provider key. Never persisted or logged. */
  apiKey: string;
  model: string;
  childContext: PlanChildContext;
  /** The conversation so far (the studio thread), replayed for continuity. */
  priorTurns?: PriorTurn[];
  /** This turn's parent message, with any sketch/photo attached. */
  message: UserContent;
  /** The summary currently on the table, so a revision rewrites it in full. */
  currentPlan?: string | null;
  /** Language for the reply and the plan: the PARENT's UI language. */
  replyLanguage: string;
  /** Abort between turns and mid-stream (Stop button / navigation). */
  signal?: AbortSignal;
  /** Live activity — the reply streams into the studio's thinking line. */
  onActivity?: (event: AgentActivityEvent) => void;
}

export interface PlanAgentResult {
  /** The assistant's plain-text reply for the chat thread ("" if it only proposed). */
  reply: string;
  /** The proposal from this exchange, or null when the model just talked. */
  plan: GamePlan | null;
  usage: TokenUsage;
  /** Model round-trips spent (for usage meta). */
  turns: number;
}

/** Read a `propose_plan` call's summary, tolerating a malformed input object. */
function readSummary(input: Record<string, unknown>): string | null {
  const summary = input.summary;
  if (typeof summary !== "string") return null;
  const trimmed = summary.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function runPlanAgent(params: RunPlanAgentParams): Promise<PlanAgentResult> {
  const {
    provider,
    apiKey,
    model,
    childContext,
    priorTurns,
    message,
    currentPlan,
    replyLanguage,
    signal,
    onActivity,
  } = params;

  const checkAborted = (): void => {
    if (signal?.aborted) throw new AgentAbortedError();
  };

  // A mid-stream abort surfaces as a provider SDK error — normalize it so
  // pressing Stop never reads as a failure.
  const runTurnChecked = async (driver: { runTurn(): Promise<GameTurn> }): Promise<GameTurn> => {
    try {
      return await driver.runTurn();
    } catch (err) {
      if (signal?.aborted) throw new AgentAbortedError();
      throw err;
    }
  };

  const driver = createGameDriver(provider, {
    apiKey,
    model,
    systemPrompt: buildPlanSystemPrompt({
      ...childContext,
      replyLanguage,
      currentPlan,
    }),
    maxTokens: Math.min(PLAN_LIMITS.MAX_TOKENS, getModelOutputCap(provider, model)),
    tools: [PROPOSE_PLAN_TOOL],
    onActivity,
    signal,
  });

  driver.seed(trimPriorImages(priorTurns), message);

  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  };
  const replyParts: string[] = [];
  let plan: GamePlan | null = null;
  let turns = 0;

  for (let turn = 0; turn < PLAN_LIMITS.MAX_TURNS; turn++) {
    checkAborted();
    const result = await runTurnChecked(driver);
    turns++;
    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;
    usage.cacheWriteTokens += result.usage.cacheWriteTokens;
    usage.cacheReadTokens += result.usage.cacheReadTokens;

    const text = result.text.trim();
    if (text) replyParts.push(text);

    if (result.toolCalls.length === 0) break;

    // Nothing to execute: record the newest proposal and acknowledge every call
    // (both providers require each tool call to be answered).
    for (const call of result.toolCalls) {
      if (call.name !== "propose_plan") continue;
      const summary = readSummary(call.input);
      if (summary) plan = { summary };
    }
    driver.addToolResults(
      result.toolCalls.map((call) => ({
        id: call.id,
        content:
          call.name === "propose_plan"
            ? "Plan shown to the parent on the Plan tab. They can edit it and approve it there."
            : `Unknown tool "${call.name}" — only propose_plan exists.`,
      })),
    );

    // The model usually narrates before proposing. Once we have both a reply and
    // a plan, another turn would only add a redundant "there you go" sentence.
    if (!result.expectsToolResults || (plan && replyParts.length > 0)) break;
  }

  return { reply: replyParts.join("\n\n"), plan, usage, turns };
}
