/**
 * Game-coding agent loop — runs fully in the browser so the provider key never
 * leaves the unlocked vault (BYOK server-blindness).
 *
 * Mirrors the former server `runCodeTask`: a multi-turn tool-use loop that writes
 * + validates a self-contained game bundle. The caller resolves the vault-
 * decrypted key client-side and persists the result itself.
 *
 * The loop is provider-neutral: a `GameCodeDriver` (see game-agent-drivers.ts)
 * runs each model turn for the configured agentic provider (Anthropic tool_use or
 * xAI Grok OpenAI-compatible tool calling). The key is passed in-memory only.
 */

import { validateGameCode } from "@dodi/games/agent-validator";
import type { AgentCodeResult, AgentTaskRequest, GenerateGamePayload, UpdateGamePayload } from "@dodi/types/tasks";
import type { AgentStep } from "@dodi/types/agent-progress";
import type { AIProviderId } from "@dodi/types/ai";
import type { TokenUsage } from "@dodi/types/usage";

import { buildAgentSystemPrompt } from "./game-agent-prompt";
import {
  executeTool,
  type LastWriteResult,
  type ToolContext,
} from "./game-agent-tools";
import {
  createGameDriver,
  type GameToolCall,
  type GameToolResult,
  type PriorTurn,
} from "./game-agent-drivers";

export type { PriorTurn } from "./game-agent-drivers";

/**
 * Cost caps for a single game action. `MAX_TOKENS` is the per-write OUTPUT cap
 * and `MAX_VALIDATION_RETRIES` bounds the number of writes; together they bound
 * the worst-case cost of a generation. `MAX_TOKENS` is the value to calibrate
 * from real `output_tokens` metrics — raise it if large bundles truncate.
 */
export const AGENT_LIMITS = {
  MAX_AGENT_TURNS: 15,
  MAX_VALIDATION_RETRIES: 1,
  MAX_TOKENS: 8000,
} as const;

/** Thrown when the loop is cancelled via its AbortSignal (parent pressed Stop). */
export class AgentAbortedError extends Error {
  constructor(message = "Task was stopped") {
    super(message);
    this.name = "AgentAbortedError";
  }
}

export interface RunGameAgentParams {
  /** Agentic (tool-use) provider driving generation (anthropic | xai). */
  provider: AIProviderId;
  /** Vault-decrypted provider key. Never persisted or logged. */
  apiKey: string;
  /** Model id (an agentic/tool-use model for the provider). */
  model: string;
  /** generate_game | update_game task with child context + payload. */
  task: AgentTaskRequest;
  /** Prior conversation (from a persisted transcript) to seed continuity on resume. */
  priorTurns?: PriorTurn[];
  /** Abort the loop between turns (Stop button / navigation). */
  signal?: AbortSignal;
  /** Progress callback driving the studio's step indicator. */
  onStep?: (step: AgentStep) => void;
}

function buildCodeTaskUserMessage(task: AgentTaskRequest): string {
  if (task.taskType === "generate_game") {
    const payload = task.payload as GenerateGamePayload;
    const lines = ["Create a new game based on this description:", "", payload.prompt];
    if (payload.title) lines.push("", `Suggested title: ${payload.title}`);
    if (payload.tags?.length) lines.push(`Tags: ${payload.tags.join(", ")}`);
    if (payload.learningGoal) lines.push("", `Learning goal: ${payload.learningGoal}`);
    if (payload.successDefinition) lines.push(`Success definition: ${payload.successDefinition}`);
    lines.push(
      "",
      "Steps:",
      "1. Read the bridge docs with read_bridge_docs",
      "2. Write the game code with write_game_code (set progressKind + successCriteria from the goal/success above)",
      "3. Validate with validate_game",
      "4. Fix any issues and re-validate if needed",
    );
    return lines.join("\n");
  }

  const payload = task.payload as UpdateGamePayload;
  const lines = ["Update the existing game with this change:", "", payload.instruction];
  if (payload.title) lines.push("", `Updated title: ${payload.title}`);
  if (payload.learningGoal) lines.push("", `Learning goal: ${payload.learningGoal}`);
  if (payload.successDefinition) lines.push(`Success definition: ${payload.successDefinition}`);
  lines.push(
    "",
    "Steps:",
    "1. Read the existing game with read_existing_game",
    "2. Make the requested changes",
    "3. Write the updated code with write_game_code (keep progressKind + successCriteria in sync with the goal/success above)",
    "4. Validate with validate_game",
    "5. Fix any issues and re-validate if needed",
  );
  return lines.join("\n");
}

export async function runGameAgent(params: RunGameAgentParams): Promise<AgentCodeResult> {
  const { provider, apiKey, model, task, priorTurns, signal, onStep } = params;
  const emitStep = onStep ?? (() => {});
  const checkAborted = (): void => {
    if (signal?.aborted) throw new AgentAbortedError();
  };

  const driver = createGameDriver(provider, {
    apiKey,
    model,
    systemPrompt: buildAgentSystemPrompt(task.childContext),
    maxTokens: AGENT_LIMITS.MAX_TOKENS,
  });
  // Seed with any resumed conversation, then the concrete task request.
  driver.seed(priorTurns, buildCodeTaskUserMessage(task));

  // Update tasks preload the existing code so read_existing_game returns it.
  const toolContext: ToolContext = {};
  if (task.taskType === "update_game") {
    const payload = task.payload as UpdateGamePayload;
    toolContext.existingCode = payload.existingCode;
    toolContext.existingMarkdown = payload.existingMarkdown;
  }

  const goalPayload = task.payload as Partial<GenerateGamePayload & UpdateGamePayload>;
  const learningGoal = goalPayload.learningGoal ?? "";
  const successDefinition = goalPayload.successDefinition ?? "";

  let lastWrite: LastWriteResult | undefined;
  let iterationCount = 0;
  let validationRetries = 0;

  // Accumulate token usage across every model call (main loop + fix loop) so the
  // caller can report the true per-generation cost. Structural param type avoids
  // depending on the exact SDK usage type name.
  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  };
  const addUsage = (u: TokenUsage): void => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheWriteTokens += u.cacheWriteTokens;
    usage.cacheReadTokens += u.cacheReadTokens;
  };

  const runToolTurn = (call: GameToolCall): GameToolResult => {
    if (call.name === "read_bridge_docs" || call.name === "read_existing_game") {
      emitStep("reading_docs");
    } else if (call.name === "write_game_code") {
      emitStep("writing_code");
    } else if (call.name === "validate_game") {
      emitStep("validating");
    }
    const { result, writeResult } = executeTool(call.name, call.input, toolContext);
    if (writeResult) {
      lastWrite = writeResult;
      toolContext.existingCode = writeResult.code;
      toolContext.existingMarkdown = writeResult.markdown;
    }
    return { id: call.id, content: result };
  };

  // Agentic loop
  for (let turn = 0; turn < AGENT_LIMITS.MAX_AGENT_TURNS; turn++) {
    checkAborted();
    const result = await driver.runTurn();
    iterationCount++;
    addUsage(result.usage);

    if (result.toolCalls.length === 0) {
      if (lastWrite) {
        emitStep("finalizing");
        break;
      }
      if (result.hasText) {
        driver.addUserMessage(
          "Please use the write_game_code tool to provide the game code, " +
            "then validate_game to verify it. Do not output code as text.",
        );
        continue;
      }
      break;
    }

    const toolResults = result.toolCalls.map(runToolTurn);
    driver.addToolResults(toolResults);

    if (!result.expectsToolResults) break;
  }

  if (!lastWrite) {
    throw new Error("Agent did not produce any game code");
  }

  const goalOpts = () => ({
    progressKind: lastWrite!.progressKind,
    requiredMetrics: lastWrite!.successCriteria.requiredMetrics,
    capabilities: lastWrite!.capabilities,
  });

  // Final validation with a bounded fix loop.
  const validation = validateGameCode(lastWrite.code, goalOpts());
  if (!validation.valid && validationRetries < AGENT_LIMITS.MAX_VALIDATION_RETRIES) {
    emitStep("fixing_validation");
    driver.addUserMessage(
      `Final validation failed with errors:\n${validation.errors.join("\n")}\n\n` +
        `Please fix these issues and use write_game_code again, then validate_game.`,
    );

    for (let retry = 0; retry < AGENT_LIMITS.MAX_VALIDATION_RETRIES; retry++) {
      checkAborted();
      validationRetries++;
      const fix = await driver.runTurn();
      iterationCount++;
      addUsage(fix.usage);

      if (fix.toolCalls.length === 0) break;

      const fixResults = fix.toolCalls.map(runToolTurn);
      driver.addToolResults(fixResults);

      const recheck = validateGameCode(lastWrite.code, goalOpts());
      if (recheck.valid) break;
    }
  }

  const finalValidation = validateGameCode(lastWrite.code, goalOpts());

  return {
    taskType: task.taskType as "generate_game" | "update_game",
    title: lastWrite.title,
    description: lastWrite.description,
    tags: lastWrite.tags,
    codeBundle: lastWrite.code,
    markdown: lastWrite.markdown,
    metadata: { capabilities: lastWrite.capabilities },
    learningGoal,
    successDefinition,
    successCriteria: lastWrite.successCriteria,
    progressKind: lastWrite.progressKind,
    changeSummary: lastWrite.changeSummary,
    validationPassed: finalValidation.valid,
    iterationCount,
    validationRetries,
    usage,
  };
}
