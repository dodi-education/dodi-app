/**
 * Agent Session Manager — server-side singleton pool.
 *
 * Manages long-lived agentic coding sessions keyed by profileId.
 * Each session maintains conversation history with the Anthropic API
 * and supports iterative code generation with tool use.
 *
 * Sessions are also persisted to the `agent_sessions` DB table so
 * progress can be recovered after page reloads and parents can
 * monitor / deactivate running tasks.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@dodi/platform/logger";
import { buildAgentSystemPrompt } from "@/lib/ai/agent-system-prompt";
import {
  AGENT_TOOLS,
  executeTool,
  type ToolContext,
  type LastWriteResult,
} from "@/lib/ai/agent-tools";
import { validateGameCode } from "@/lib/ai/agent-validator";
import {
  updateAgentSessionProgress,
  completeAgentSession,
  failAgentSession,
} from "@dodi/platform/services/agent-sessions";
import type { Database, AgentSessionResult } from "@dodi/types/database";
import type {
  AgentTaskRequest,
  AgentTaskResult,
  AgentCodeResult,
  AgentAnalysisResult,
  GenerateGamePayload,
  UpdateGamePayload,
  ReadGameStatePayload,
} from "@dodi/types/tasks";
import type { AgentProgressEvent, AgentStep } from "@dodi/types/agent-progress";

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

interface AgentSession {
  profileId: string;
  messages: Anthropic.MessageParam[];
  currentGameId: string | null;
  apiKey: string;
  model: string;
  lastActivity: number;
  busy: boolean;
  abortController: AbortController | null;
}

/** Thrown when a task is cancelled via AbortSignal. */
export class AgentAbortedError extends Error {
  constructor(message = "Task was deactivated") {
    super(message);
    this.name = "AgentAbortedError";
  }
}

/** Options for DB-backed task execution. */
export interface SubmitTaskOptions {
  dbSessionId?: string;
  supabase?: SupabaseClient<Database>;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Session pool (module-level singleton)
// ---------------------------------------------------------------------------

const log = createLogger("agent-loop");

const sessions = new Map<string, AgentSession>();
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_AGENT_TURNS = 15;
const MAX_VALIDATION_RETRIES = 3;

// Reaper interval
let reaperInterval: ReturnType<typeof setInterval> | null = null;

function startReaper(): void {
  if (reaperInterval) return;
  reaperInterval = setInterval(() => {
    const now = Date.now();
    for (const [profileId, session] of sessions) {
      if (!session.busy && now - session.lastActivity > INACTIVITY_TIMEOUT_MS) {
        log.debug("session_reaped", { profileId });
        sessions.delete(profileId);
      }
    }
    if (sessions.size === 0 && reaperInterval) {
      clearInterval(reaperInterval);
      reaperInterval = null;
    }
  }, 60_000); // check every minute
}

// ---------------------------------------------------------------------------
// Progress → DB mapping
// ---------------------------------------------------------------------------

function mapStepToProgress(step: AgentStep): "planning" | "building" | "testing" | "done" {
  switch (step) {
    case "reading_docs":
      return "planning";
    case "writing_code":
      return "building";
    case "validating":
    case "fixing_validation":
      return "testing";
    case "finalizing":
      return "done";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getOrCreateSession(
  profileId: string,
  apiKey: string,
  model: string,
): AgentSession {
  let session = sessions.get(profileId);
  if (session) {
    // Update key/model in case they changed
    session.apiKey = apiKey;
    session.model = model;
    session.lastActivity = Date.now();
    log.debug("session_reused", { profileId, messageCount: session.messages.length });
    return session;
  }

  session = {
    profileId,
    messages: [],
    currentGameId: null,
    apiKey,
    model,
    lastActivity: Date.now(),
    busy: false,
    abortController: null,
  };
  sessions.set(profileId, session);
  startReaper();
  log.info("session_created", { profileId, model });
  return session;
}

export function resetGameContext(profileId: string): void {
  const session = sessions.get(profileId);
  if (session) {
    session.messages = [];
    session.currentGameId = null;
  }
}

export function destroySession(profileId: string): void {
  sessions.delete(profileId);
}

/**
 * Abort a running task for the given profile.
 * Returns true if an active task was found and aborted.
 */
export function abortSession(profileId: string): boolean {
  const session = sessions.get(profileId);
  if (!session?.abortController) return false;
  log.warn("session_aborted", { profileId });
  session.abortController.abort();
  return true;
}

export async function submitTask(
  profileId: string,
  task: AgentTaskRequest,
  onProgress?: (event: AgentProgressEvent) => void,
  options?: SubmitTaskOptions,
): Promise<AgentTaskResult> {
  const session = sessions.get(profileId);
  if (!session) {
    throw new Error("No agent session found. Call getOrCreateSession first.");
  }

  if (session.busy) {
    throw new Error("Agent is busy processing another task");
  }

  // Reset context if game changed
  if (task.gameId && task.gameId !== session.currentGameId) {
    session.messages = [];
    session.currentGameId = task.gameId;
  }

  // Set up abort controller for this task
  const abortController = new AbortController();
  session.abortController = abortController;

  // If an external signal is provided (e.g. from deactivation), chain it
  if (options?.signal) {
    options.signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });
  }

  session.busy = true;
  session.lastActivity = Date.now();
  log.info("task_started", { profileId, taskType: task.taskType, gameId: task.gameId });

  try {
    if (task.taskType === "read_game_state") {
      return await runAnalysisTask(session, task);
    } else {
      return await runCodeTask(session, task, onProgress, options);
    }
  } catch (err) {
    // If this was an abort, re-throw as AgentAbortedError
    if (abortController.signal.aborted && !(err instanceof AgentAbortedError)) {
      throw new AgentAbortedError();
    }
    throw err;
  } finally {
    session.busy = false;
    session.abortController = null;
    session.lastActivity = Date.now();
  }
}

// ---------------------------------------------------------------------------
// Analysis task (pure reasoning, no tools)
// ---------------------------------------------------------------------------

async function runAnalysisTask(
  session: AgentSession,
  task: AgentTaskRequest,
): Promise<AgentAnalysisResult> {
  const payload = task.payload as ReadGameStatePayload;
  log.debug("analysis_started", {
    profileId: session.profileId,
    hasSnapshot: !!payload.snapshot,
    questionLength: payload.question?.length ?? 0,
  });
  const anthropic = new Anthropic({ apiKey: session.apiKey });

  const userMessage = [
    `Question: ${payload.question}`,
    "",
    "## Current Game State",
    JSON.stringify(payload.gameState, null, 2),
  ];

  if (payload.gameMarkdown) {
    userMessage.push("", "## Game Documentation", payload.gameMarkdown);
  }
  if (payload.gameCodeBundle) {
    userMessage.push("", "## Game Source Code", "```html", payload.gameCodeBundle, "```");
  }

  // Build content blocks — include canvas snapshot as image if available
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  if (payload.snapshot) {
    const base64Match = payload.snapshot.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/);
    if (base64Match) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: `image/${base64Match[1]}` as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: base64Match[2],
        },
      });
    }
  }

  content.push({ type: "text", text: userMessage.join("\n") });

  const hasSnapshot = content.length > 1;
  const systemPrompt = `You are analyzing game state for a kid's AI learning companion called Dodi. ` +
    (hasSnapshot
      ? `A snapshot of the canvas is included — describe what you SEE in the image. `
      : `Describe what you see in the game state in natural, kid-friendly language. `) +
    `The child's name is ${task.childContext.name}. ` +
    `Respond in ${task.childContext.language}. ` +
    `Keep your response concise (2-3 sentences max).`;

  // Analysis is stateless — don't pollute conversation history
  const response = await anthropic.messages.create({
    model: session.model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const analysis = textBlock ? textBlock.text : "I couldn't analyze the game state.";

  log.debug("analysis_complete", {
    profileId: session.profileId,
    responseLength: analysis.length,
  });

  return { taskType: "read_game_state", analysis };
}

// ---------------------------------------------------------------------------
// Code task (agentic loop with tools)
// ---------------------------------------------------------------------------

async function runCodeTask(
  session: AgentSession,
  task: AgentTaskRequest,
  onProgress?: (event: AgentProgressEvent) => void,
  options?: SubmitTaskOptions,
): Promise<AgentCodeResult> {
  const emit = onProgress ?? (() => {});
  const anthropic = new Anthropic({ apiKey: session.apiKey });
  const systemPrompt = buildAgentSystemPrompt(task.childContext);
  const { dbSessionId, supabase } = options ?? {};

  // Helper: emit progress event and update DB
  const emitProgress = (step: AgentStep, turn: number): void => {
    emit({ type: "step", step, turn });
    if (dbSessionId && supabase) {
      updateAgentSessionProgress(supabase, dbSessionId, mapStepToProgress(step)).catch(() => {
        // Non-critical — swallow
      });
    }
  };

  // Helper: check if task was aborted
  const checkAborted = (): void => {
    if (session.abortController?.signal.aborted) {
      throw new AgentAbortedError();
    }
  };

  // Build user message based on task type
  const userContent = buildCodeTaskUserMessage(task);

  // Build tool context
  const toolContext: ToolContext = {};
  if (task.taskType === "update_game") {
    const payload = task.payload as UpdateGamePayload;
    toolContext.existingCode = payload.existingCode;
    toolContext.existingMarkdown = payload.existingMarkdown;
  }

  // The parent's plain-language goal/success carry through to the saved game
  // unchanged; the agent only produces the structured mapping + code.
  const goalPayload = task.payload as Partial<
    GenerateGamePayload & UpdateGamePayload
  >;
  const learningGoal = goalPayload.learningGoal ?? "";
  const successDefinition = goalPayload.successDefinition ?? "";

  // Add user message to session history
  session.messages.push({ role: "user", content: userContent });

  let lastWrite: LastWriteResult | undefined;
  let iterationCount = 0;
  let validationRetries = 0;

  // Agentic loop
  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    checkAborted();
    log.debug("loop_turn", {
      profileId: session.profileId,
      turn,
      messageCount: session.messages.length,
    });

    const apiTimer = log.time("api_call");
    const response = await anthropic.messages.create({
      model: session.model,
      max_tokens: 16384,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages: session.messages,
    });

    iterationCount++;

    // Process response content
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );

    apiTimer({
      profileId: session.profileId,
      turn,
      stopReason: response.stop_reason,
      toolCallCount: toolUseBlocks.length,
      textBlockCount: textBlocks.length,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    // Add assistant response to history
    session.messages.push({ role: "assistant", content: response.content });

    // If no tool calls, agent is done
    if (toolUseBlocks.length === 0) {
      // If we have a lastWrite, we're done.
      if (lastWrite) {
        emitProgress("finalizing", iterationCount);
        break;
      }

      // Agent responded with only text and no write — ask it to use tools.
      if (textBlocks.length > 0) {
        log.warn("text_only_response", { profileId: session.profileId, turn });
        session.messages.push({
          role: "user",
          content:
            "Please use the write_game_code tool to provide the game code, " +
            "then validate_game to verify it. Do not output code as text.",
        });
        continue;
      }
      break;
    }

    // Execute all tool calls and emit progress for each
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      // Emit step based on tool name
      if (toolUse.name === "read_bridge_docs" || toolUse.name === "read_existing_game") {
        emitProgress("reading_docs", iterationCount);
      } else if (toolUse.name === "write_game_code") {
        emitProgress("writing_code", iterationCount);
      } else if (toolUse.name === "validate_game") {
        emitProgress("validating", iterationCount);
      }

      const { result, writeResult } = executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        toolContext,
      );
      log.info("tool_executed", {
        profileId: session.profileId,
        turn,
        toolName: toolUse.name,
      });

      if (writeResult) {
        lastWrite = writeResult;
        // Update tool context so read_existing_game returns latest code
        toolContext.existingCode = writeResult.code;
        toolContext.existingMarkdown = writeResult.markdown;
      }

      // Emit validation result for validate_game
      if (toolUse.name === "validate_game" && result) {
        try {
          const parsed = JSON.parse(result) as { valid: boolean; errors?: string[] };
          emit({
            type: "validation",
            valid: parsed.valid,
            errors: parsed.errors ?? [],
            turn: iterationCount,
          });
        } catch {
          // Non-JSON result — skip validation event
        }
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add tool results to history
    session.messages.push({ role: "user", content: toolResults });

    // If stop reason is not tool_use, agent is done with tool calls
    if (response.stop_reason !== "tool_use") {
      break;
    }
  }

  // Final validation if we have code
  if (lastWrite) {
    const goalOpts = () => ({
      progressKind: lastWrite!.progressKind,
      requiredMetrics: lastWrite!.successCriteria.requiredMetrics,
    });
    const validation = validateGameCode(lastWrite.code, goalOpts());
    if (!validation.valid && validationRetries < MAX_VALIDATION_RETRIES) {
      log.warn("validation_retry", {
        profileId: session.profileId,
        retryNumber: validationRetries,
        errors: validation.errors,
      });
      emitProgress("fixing_validation", iterationCount);

      // Ask agent to fix
      session.messages.push({
        role: "user",
        content:
          `Final validation failed with errors:\n${validation.errors.join("\n")}\n\n` +
          `Please fix these issues and use write_game_code again, then validate_game.`,
      });

      // Run a few more turns to fix
      for (let retry = 0; retry < MAX_VALIDATION_RETRIES; retry++) {
        checkAborted();

        validationRetries++;
        const fixResponse = await anthropic.messages.create({
          model: session.model,
          max_tokens: 16384,
          system: systemPrompt,
          tools: AGENT_TOOLS,
          messages: session.messages,
        });

        iterationCount++;
        const fixToolUses = fixResponse.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );

        session.messages.push({ role: "assistant", content: fixResponse.content });

        if (fixToolUses.length === 0) break;

        const fixResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of fixToolUses) {
          if (toolUse.name === "write_game_code") {
            emitProgress("writing_code", iterationCount);
          } else if (toolUse.name === "validate_game") {
            emitProgress("validating", iterationCount);
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

          if (toolUse.name === "validate_game" && result) {
            try {
              const parsed = JSON.parse(result) as { valid: boolean; errors?: string[] };
              emit({
                type: "validation",
                valid: parsed.valid,
                errors: parsed.errors ?? [],
                turn: iterationCount,
              });
            } catch {
              // skip
            }
          }

          fixResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        }
        session.messages.push({ role: "user", content: fixResults });

        // Re-validate
        if (lastWrite) {
          const recheck = validateGameCode(lastWrite.code, goalOpts());
          if (recheck.valid) break;
        }
      }
    }

    const finalValidation = validateGameCode(lastWrite.code, goalOpts());

    log.info("code_produced", {
      profileId: session.profileId,
      title: lastWrite.title,
      codeSizeBytes: lastWrite.code.length,
      validationPassed: finalValidation.valid,
      iterationCount,
    });

    const codeResult: AgentCodeResult = {
      taskType: task.taskType as "generate_game" | "update_game",
      title: lastWrite.title,
      description: lastWrite.description,
      tags: lastWrite.tags,
      codeBundle: lastWrite.code,
      markdown: lastWrite.markdown,
      metadata: {},
      learningGoal,
      successDefinition,
      successCriteria: lastWrite.successCriteria,
      progressKind: lastWrite.progressKind,
      changeSummary: lastWrite.changeSummary,
      validationPassed: finalValidation.valid,
      iterationCount,
    };

    // Persist result to DB
    if (dbSessionId && supabase) {
      const sessionResult: AgentSessionResult = {
        title: codeResult.title,
        description: codeResult.description,
        tags: codeResult.tags,
        codeBundle: codeResult.codeBundle,
        markdown: codeResult.markdown,
        metadata: codeResult.metadata,
        learningGoal: codeResult.learningGoal,
        successDefinition: codeResult.successDefinition,
        successCriteria: codeResult.successCriteria,
        progressKind: codeResult.progressKind,
        changeSummary: codeResult.changeSummary,
        validationPassed: codeResult.validationPassed,
        iterationCount: codeResult.iterationCount,
      };
      await completeAgentSession(supabase, dbSessionId, sessionResult);
    }

    return codeResult;
  }

  // No code produced — mark as failed in DB
  log.error("no_code_produced", { profileId: session.profileId, iterationCount });
  const errorMsg = "Agent did not produce any game code";
  if (dbSessionId && supabase) {
    await failAgentSession(supabase, dbSessionId, errorMsg);
  }
  throw new Error(errorMsg);
}

// ---------------------------------------------------------------------------
// User message builders
// ---------------------------------------------------------------------------

function buildCodeTaskUserMessage(task: AgentTaskRequest): string {
  if (task.taskType === "generate_game") {
    const payload = task.payload as GenerateGamePayload;
    const lines = [
      "Create a new game based on this description:",
      "",
      payload.prompt,
    ];
    if (payload.title) lines.push("", `Suggested title: ${payload.title}`);
    if (payload.tags?.length) lines.push(`Tags: ${payload.tags.join(", ")}`);
    if (payload.learningGoal) lines.push("", `Learning goal: ${payload.learningGoal}`);
    if (payload.successDefinition)
      lines.push(`Success definition: ${payload.successDefinition}`);
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

  if (task.taskType === "update_game") {
    const payload = task.payload as UpdateGamePayload;
    const lines = [
      "Update the existing game with this change:",
      "",
      payload.instruction,
    ];
    if (payload.title) lines.push("", `Updated title: ${payload.title}`);
    if (payload.learningGoal) lines.push("", `Learning goal: ${payload.learningGoal}`);
    if (payload.successDefinition)
      lines.push(`Success definition: ${payload.successDefinition}`);
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

  return "Unexpected task type";
}

// ---------------------------------------------------------------------------
// Trim session history to prevent unbounded growth
// ---------------------------------------------------------------------------

// Keep last N message pairs to prevent context window overflow.
// Called periodically or before each task if history is long.
const MAX_HISTORY_PAIRS = 20;

export function trimHistory(profileId: string): void {
  const session = sessions.get(profileId);
  if (!session) return;
  if (session.messages.length <= MAX_HISTORY_PAIRS * 2) return;

  // Keep the most recent messages
  session.messages = session.messages.slice(-(MAX_HISTORY_PAIRS * 2));
}
