/**
 * Game-coding agent loop — runs fully in the browser so the provider key never
 * leaves the unlocked vault (BYOK server-blindness).
 *
 * Mirrors the former server `runCodeTask`: a multi-turn Anthropic tool-use loop
 * that writes + validates a self-contained game bundle. The caller resolves the
 * vault-decrypted key client-side and persists the result itself.
 *
 * Tool use is Anthropic-specific, so generation requires an Anthropic thinking
 * model (matching prior behaviour). The provider key is passed in-memory only.
 */

import Anthropic from "@anthropic-ai/sdk";

import { validateGameCode } from "@dodi/games/agent-validator";
import type { AgentCodeResult, AgentTaskRequest, GenerateGamePayload, UpdateGamePayload } from "@dodi/types/tasks";
import type { AgentStep } from "@dodi/types/agent-progress";

import { buildAgentSystemPrompt } from "./game-agent-prompt";
import {
  AGENT_TOOLS,
  executeTool,
  type LastWriteResult,
  type ToolContext,
} from "./game-agent-tools";

const MAX_AGENT_TURNS = 15;
const MAX_VALIDATION_RETRIES = 3;
const MAX_TOKENS = 16384;

/** Thrown when the loop is cancelled via its AbortSignal (parent pressed Stop). */
export class AgentAbortedError extends Error {
  constructor(message = "Task was stopped") {
    super(message);
    this.name = "AgentAbortedError";
  }
}

/** A resumed display turn — restored from a persisted conversation transcript. */
export interface PriorTurn {
  role: "user" | "assistant";
  text: string;
}

export interface RunGameAgentParams {
  /** Vault-decrypted provider key (Anthropic). Never persisted or logged. */
  apiKey: string;
  /** Anthropic model id (thinking model). */
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

/** Collapse consecutive same-role turns so the API always sees alternating roles. */
function toSeedMessages(turns: PriorTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    const text = turn.text.trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content as string}\n\n${text}`;
    } else {
      out.push({ role: turn.role, content: text });
    }
  }
  return out;
}

/**
 * Return `messages` with a rolling prompt-cache breakpoint on the last block of
 * the final turn. Each turn re-sends the whole transcript (system prompt, bridge
 * docs, the full game bundle) as input; without caching that context is re-billed
 * at full price on all ~6-15 turns — the bulk of a generation's cost. The rolling
 * breakpoint (plus the static one on `system`) lets every turn re-read the prior
 * context at ~0.1x. Honoured by Anthropic and by Venice (for Claude models);
 * confirm hits via `usage.cache_read_input_tokens`. The source array is left
 * untouched — the marker is request-only.
 */
function messagesWithRollingCache(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === "string"
      ? [{ type: "text", text: last.content }]
      : last.content.slice();
  const i = blocks.length - 1;
  blocks[i] = {
    ...blocks[i],
    cache_control: { type: "ephemeral" },
  } as Anthropic.ContentBlockParam;
  out[out.length - 1] = { ...last, content: blocks };
  return out;
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
  const { apiKey, model, task, priorTurns, signal, onStep } = params;
  const emitStep = onStep ?? (() => {});
  const checkAborted = (): void => {
    if (signal?.aborted) throw new AgentAbortedError();
  };

  const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const systemPrompt = buildAgentSystemPrompt(task.childContext);
  // Cache the static prefix (tools render before system, so this one breakpoint
  // covers both). The rolling per-turn breakpoint is added in the create calls.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
  ];

  // Seed with any resumed conversation, then the concrete task request.
  const messages: Anthropic.MessageParam[] = priorTurns?.length
    ? toSeedMessages(priorTurns)
    : [];
  messages.push({ role: "user", content: buildCodeTaskUserMessage(task) });

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

  const runToolTurn = (toolUse: Anthropic.ToolUseBlock): Anthropic.ToolResultBlockParam => {
    if (toolUse.name === "read_bridge_docs" || toolUse.name === "read_existing_game") {
      emitStep("reading_docs");
    } else if (toolUse.name === "write_game_code") {
      emitStep("writing_code");
    } else if (toolUse.name === "validate_game") {
      emitStep("validating");
    }
    const { result, writeResult } = executeTool(
      toolUse.name,
      toolUse.input as Record<string, unknown>,
      toolContext,
    );
    if (writeResult) {
      lastWrite = writeResult;
      toolContext.existingCode = writeResult.code;
      toolContext.existingMarkdown = writeResult.markdown;
    }
    return { type: "tool_result", tool_use_id: toolUse.id, content: result };
  };

  // Agentic loop
  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    checkAborted();
    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: AGENT_TOOLS,
      messages: messagesWithRollingCache(messages),
    });
    iterationCount++;

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );

    messages.push({ role: "assistant", content: response.content });

    if (toolUseBlocks.length === 0) {
      if (lastWrite) {
        emitStep("finalizing");
        break;
      }
      if (textBlocks.length > 0) {
        messages.push({
          role: "user",
          content:
            "Please use the write_game_code tool to provide the game code, " +
            "then validate_game to verify it. Do not output code as text.",
        });
        continue;
      }
      break;
    }

    const toolResults = toolUseBlocks.map(runToolTurn);
    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason !== "tool_use") break;
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
  if (!validation.valid && validationRetries < MAX_VALIDATION_RETRIES) {
    emitStep("fixing_validation");
    messages.push({
      role: "user",
      content:
        `Final validation failed with errors:\n${validation.errors.join("\n")}\n\n` +
        `Please fix these issues and use write_game_code again, then validate_game.`,
    });

    for (let retry = 0; retry < MAX_VALIDATION_RETRIES; retry++) {
      checkAborted();
      validationRetries++;
      const fixResponse = await anthropic.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools: AGENT_TOOLS,
        messages: messagesWithRollingCache(messages),
      });
      iterationCount++;

      const fixToolUses = fixResponse.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      messages.push({ role: "assistant", content: fixResponse.content });
      if (fixToolUses.length === 0) break;

      const fixResults = fixToolUses.map(runToolTurn);
      messages.push({ role: "user", content: fixResults });

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
  };
}
