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
import { coerceProgressKind, coerceSuccessCriteria } from "@dodi/games/game-spec";
import {
  BACKGROUND_IMAGE_PLACEHOLDER,
  extractBackgroundImage,
  hasBackgroundPlaceholder,
} from "@dodi/games/background-image";
import type { AgentCodeResult, AgentTaskRequest, GenerateGamePayload, UpdateGamePayload } from "@dodi/types/tasks";
import type { AgentStep } from "@dodi/types/agent-progress";
import type { AIProviderId } from "@dodi/types/ai";
import type { TokenUsage } from "@dodi/types/usage";

import { buildAgentSystemPrompt } from "./game-agent-prompt";
import { getModelOutputCap } from "./providers";
import {
  buildAgentTools,
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
 * Cost caps for a single game action. `MAX_TOKENS` is the per-write OUTPUT
 * ceiling and `MAX_VALIDATION_RETRIES` bounds the number of writes; together
 * they bound the worst-case cost of a generation. Raised 8k → 100k on
 * 2026-07-17 after prod builds truncated mid-`write_game_code` (error_logs
 * stopReason "max_tokens") — real bundles peak around 10-15k output tokens, so
 * this is deliberate headroom, not expected spend. The effective per-request
 * value is clamped to the model's own output cap (`getModelOutputCap`), since
 * requesting above a model's maximum is a 400 on Anthropic.
 */
export const AGENT_LIMITS = {
  MAX_AGENT_TURNS: 15,
  MAX_VALIDATION_RETRIES: 1,
  MAX_TOKENS: 100_000,
} as const;

/** Thrown when the loop is cancelled via its AbortSignal (parent pressed Stop). */
export class AgentAbortedError extends Error {
  constructor(message = "Task was stopped") {
    super(message);
    this.name = "AgentAbortedError";
  }
}

/** How far the loop got before failing — content-free, safe to report as
 *  telemetry. `lastStopReason === "max_tokens"` means the write was truncated
 *  (the MAX_TOKENS cap is too small for the requested game). */
export interface GameAgentDiagnostics {
  turns: number;
  lastStopReason: string | null;
  sawToolCalls: boolean;
  sawText: boolean;
}

/** Thrown when the loop finishes without the model ever writing game code. */
export class GameAgentError extends Error {
  readonly diagnostics: GameAgentDiagnostics;

  constructor(message: string, diagnostics: GameAgentDiagnostics) {
    super(message);
    this.name = "GameAgentError";
    this.diagnostics = diagnostics;
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
  /**
   * Client-injected background-image generation (image provider + vault key are
   * resolved by the caller). Presence enables the generate_background_image
   * tool. Returns a downscaled data URL; throws on failure.
   */
  onGenerateBackgroundImage?: (scene: string) => Promise<string>;
  /**
   * Client-injected bound-for-bundle preparation (downscale/recompress) for an
   * uploaded reference image chosen as the background (use_uploaded_background).
   */
  onPrepareBackgroundImage?: (dataUrl: string) => Promise<string>;
  /**
   * Client-injected preview-image generation (image provider + vault key are
   * resolved by the caller). Presence enables the generate_preview_image tool.
   * Receives the scene plus the game's background image (when one exists) as a
   * style reference; returns the cropped square list-preview data URL.
   */
  onGeneratePreviewImage?: (scene: string, backgroundImage?: string) => Promise<string>;
  /**
   * The game already has a list preview image — softens the preview nudge to
   * "regenerate only on a real look change or when the parent asks" so routine
   * edits don't spend an image generation every time.
   */
  hasExistingPreviewImage?: boolean;
}

/** How many of the most recent image-bearing user turns re-send their images. */
export const MAX_IMAGE_TURNS = 2;

/**
 * Strip images from all but the most recent MAX_IMAGE_TURNS user turns so old
 * attachments stop costing image tokens on every subsequent build. The full
 * images stay in the sealed transcript for display — this only trims what is
 * re-fed to the model.
 */
function trimPriorImages(turns: PriorTurn[] | undefined): PriorTurn[] | undefined {
  if (!turns?.length) return turns;
  let kept = 0;
  const reversed = [...turns].reverse().map((turn): PriorTurn => {
    if (turn.role !== "user" || !turn.images?.length) return turn;
    if (kept < MAX_IMAGE_TURNS) {
      kept++;
      return turn;
    }
    return { role: turn.role, text: `${turn.text}\n[image attached]` };
  });
  return reversed.reverse();
}

function buildCodeTaskUserMessage(task: AgentTaskRequest): string {
  if (task.taskType === "generate_game") {
    const payload = task.payload as GenerateGamePayload;
    const lines = ["Create a new game based on this description:", "", payload.prompt];
    if (payload.title) lines.push("", `Title: ${payload.title} (set by the parent — keep it)`);
    if (payload.tags?.length) lines.push(`Tags: ${payload.tags.join(", ")}`);
    if (payload.learningGoal) lines.push("", `Learning goal: ${payload.learningGoal}`);
    if (payload.successDefinition) lines.push(`Success definition: ${payload.successDefinition}`);
    if (payload.images?.length) {
      lines.push(
        "",
        `${payload.images.length} reference image(s) are attached — use them as visual guidance.`,
      );
    }
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
  if (payload.title) lines.push("", `Title: ${payload.title} (set by the parent — keep it)`);
  if (payload.learningGoal) lines.push("", `Learning goal: ${payload.learningGoal}`);
  if (payload.successDefinition) lines.push(`Success definition: ${payload.successDefinition}`);
  if (payload.screenshot) {
    lines.push(
      "",
      "The FIRST attached image is a screenshot of the game exactly as it looks right now — " +
        "assess the current visuals from it before deciding your changes.",
    );
  }
  if (payload.images?.length) {
    lines.push(
      "",
      `${payload.images.length} reference image(s) are attached${
        payload.screenshot ? " after the screenshot" : ""
      } — use them as visual guidance.`,
    );
  }
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
  const {
    provider,
    apiKey,
    model,
    task,
    priorTurns,
    signal,
    onStep,
    onGenerateBackgroundImage,
    onPrepareBackgroundImage,
    onGeneratePreviewImage,
    hasExistingPreviewImage,
  } = params;
  const emitStep = onStep ?? (() => {});
  const checkAborted = (): void => {
    if (signal?.aborted) throw new AgentAbortedError();
  };

  const goalPayload = task.payload as Partial<GenerateGamePayload & UpdateGamePayload>;

  const driver = createGameDriver(provider, {
    apiKey,
    model,
    systemPrompt: buildAgentSystemPrompt({
      ...task.childContext,
      perspective: goalPayload.perspective ?? null,
    }),
    maxTokens: Math.min(AGENT_LIMITS.MAX_TOKENS, getModelOutputCap(provider, model)),
    tools: buildAgentTools({
      backgroundImage: Boolean(onGenerateBackgroundImage),
      uploadedImages: Boolean(goalPayload.images?.length),
      previewImage: Boolean(onGeneratePreviewImage),
    }),
  });

  // Update tasks preload the existing code so read_existing_game returns it —
  // with any inline background image swapped back to its placeholder so base64
  // never enters the model transcript (runs regardless of the current setting).
  const toolContext: ToolContext = {
    generateBackgroundImage: onGenerateBackgroundImage,
    prepareBackgroundImage: onPrepareBackgroundImage,
    generatePreviewImage: onGeneratePreviewImage,
    referenceImages: goalPayload.images,
  };
  if (task.taskType === "update_game") {
    const payload = task.payload as UpdateGamePayload;
    const extracted = extractBackgroundImage(payload.existingCode);
    toolContext.existingCode = extracted.code;
    toolContext.existingMarkdown = payload.existingMarkdown;
    if (extracted.dataUrl) toolContext.carriedBackgroundImage = extracted.dataUrl;
  }

  // Seed with any resumed conversation, then the concrete task request. Update
  // tasks lead with the current-state screenshot, then any reference images.
  const taskImages = goalPayload.screenshot
    ? [goalPayload.screenshot, ...(goalPayload.images ?? [])]
    : goalPayload.images;
  const carriedNote = toolContext.carriedBackgroundImage
    ? "\n\nThe existing game has a generated background image, represented in the code by the " +
      `${BACKGROUND_IMAGE_PLACEHOLDER} placeholder — keep the background-image style block unless the ` +
      "parent asks to remove or replace the background."
    : "";
  // The parent explicitly enabled background generation — using the tool is
  // expected, not optional (unless an image already exists from a prior build).
  // With attachments present, the parent's instruction may pick an uploaded
  // image instead — the nudge must not override that.
  const backgroundNote =
    onGenerateBackgroundImage && !toolContext.carriedBackgroundImage
      ? "\n\nThe parent enabled AI background generation for this game: give it a real " +
        "background image BEFORE write_game_code — via generate_background_image with a " +
        "scene description" +
        (goalPayload.images?.length
          ? ", or via use_uploaded_background if the parent asks to use an attached image " +
            "as the background (the parent's instruction wins)"
          : "") +
        ` — and reference the result via the ${BACKGROUND_IMAGE_PLACEHOLDER} contract.`
      : "";
  // The parent enabled AI list previews. Without one yet, generating it is
  // expected on this build; with one, routine edits must not spend an image
  // generation — only a real look change or an explicit parent ask does.
  const previewNote = onGeneratePreviewImage
    ? hasExistingPreviewImage
      ? "\n\nThe parent enabled AI preview-image generation and the game already has a list " +
        "preview. Call generate_preview_image (AFTER your final write_game_code) only when " +
        "your changes noticeably alter the game's look or theme, or when the parent asks " +
        "for a new preview."
      : "\n\nThe parent enabled AI preview-image generation: AFTER your final " +
        "write_game_code + validate_game, call generate_preview_image once with a scene " +
        "description of the finished game's key visual — it becomes the game's list icon."
    : "";
  driver.seed(trimPriorImages(priorTurns), {
    text: buildCodeTaskUserMessage(task) + carriedNote + backgroundNote + previewNote,
    images: taskImages,
  });

  const learningGoal = goalPayload.learningGoal ?? "";
  const successDefinition = goalPayload.successDefinition ?? "";

  let lastWrite: LastWriteResult | undefined;
  let iterationCount = 0;
  let validationRetries = 0;
  let lastStopReason: string | null = null;
  let sawToolCalls = false;
  let sawText = false;

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

  const runToolTurn = async (call: GameToolCall): Promise<GameToolResult> => {
    if (
      call.name === "read_bridge_docs" ||
      call.name === "read_existing_game" ||
      call.name === "read_char_paths"
    ) {
      emitStep("reading_docs");
    } else if (call.name === "generate_background_image" || call.name === "use_uploaded_background") {
      emitStep("generating_image");
    } else if (call.name === "generate_preview_image") {
      emitStep("generating_preview");
    } else if (call.name === "write_game_code") {
      emitStep("writing_code");
    } else if (call.name === "validate_game") {
      emitStep("validating");
    }
    const { result, writeResult } = await executeTool(call.name, call.input, toolContext);
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
    lastStopReason = result.stopReason;
    sawToolCalls ||= result.toolCalls.length > 0;
    sawText ||= result.hasText;

    if (result.toolCalls.length === 0) {
      if (lastWrite) {
        emitStep("finalizing");
        break;
      }
      // Preview-only run: the parent asked for a new preview image in chat and
      // the model (correctly) changed nothing else — done, no write required.
      // A failed attempt ends the same way instead of nudging the model into a
      // pointless full rewrite; the caller surfaces the failure notice.
      if (
        task.taskType === "update_game" &&
        (toolContext.freshPreviewImage || toolContext.previewImageFailed)
      ) {
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

    // Promise.all preserves order, so each tool_use id gets its matching result.
    const toolResults = await Promise.all(result.toolCalls.map(runToolTurn));
    driver.addToolResults(toolResults);

    if (!result.expectsToolResults) break;
  }

  if (!lastWrite) {
    // Preview-only completion: hand back the existing bundle untouched with the
    // fresh preview attached (or just the failure flag) — the caller persists
    // ONLY the preview image, so every other field here is a placeholder it
    // must ignore.
    if (
      task.taskType === "update_game" &&
      (toolContext.freshPreviewImage || toolContext.previewImageFailed) &&
      toolContext.existingCode
    ) {
      return {
        taskType: "update_game",
        title: goalPayload.title?.trim() ?? "",
        description: "",
        tags: [],
        codeBundle: toolContext.existingCode,
        markdown: toolContext.existingMarkdown ?? "",
        backgroundImage: hasBackgroundPlaceholder(toolContext.existingCode)
          ? toolContext.carriedBackgroundImage
          : undefined,
        previewImage: toolContext.freshPreviewImage,
        previewImageFailed: toolContext.previewImageFailed,
        previewOnly: true,
        metadata: {},
        learningGoal,
        successDefinition,
        successCriteria: coerceSuccessCriteria(undefined),
        progressKind: coerceProgressKind(undefined),
        changeSummary: "",
        validationPassed: true,
        iterationCount,
        validationRetries,
        usage,
      };
    }
    throw new GameAgentError("Agent did not produce any game code", {
      turns: iterationCount,
      lastStopReason,
      sawToolCalls,
      sawText,
    });
  }

  const goalOpts = () => ({
    progressKind: lastWrite!.progressKind,
    requiredMetrics: lastWrite!.successCriteria.requiredMetrics,
    capabilities: lastWrite!.capabilities,
    // "Image available": generated this run, or carried AND still referenced (a
    // carried background may be dropped deliberately — never an error).
    hasBackgroundImage:
      toolContext.freshBackgroundImage !== undefined ||
      (toolContext.carriedBackgroundImage !== undefined &&
        hasBackgroundPlaceholder(lastWrite!.code)),
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

      const fixResults = await Promise.all(fix.toolCalls.map(runToolTurn));
      driver.addToolResults(fixResults);

      const recheck = validateGameCode(lastWrite.code, goalOpts());
      if (recheck.valid) break;
    }
  }

  const finalValidation = validateGameCode(lastWrite.code, goalOpts());

  // The bundle stays in placeholder form — the caller injects the image before
  // rendering/persisting. A carried image survives only while still referenced.
  const backgroundImage =
    toolContext.freshBackgroundImage ??
    (hasBackgroundPlaceholder(lastWrite.code) ? toolContext.carriedBackgroundImage : undefined);

  // The title is parent-owned: when the task payload carries one (the parent's
  // setting on both generate and update tasks) it wins. The model's title is
  // only a fallback for untitled flows (e.g. voice-created games).
  const parentTitle = goalPayload.title?.trim();

  return {
    taskType: task.taskType as "generate_game" | "update_game",
    title: parentTitle || lastWrite.title,
    description: lastWrite.description,
    tags: lastWrite.tags,
    codeBundle: lastWrite.code,
    markdown: lastWrite.markdown,
    backgroundImage,
    backgroundImageFailed: toolContext.backgroundImageFailed,
    previewImage: toolContext.freshPreviewImage,
    previewImageFailed: toolContext.previewImageFailed,
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
