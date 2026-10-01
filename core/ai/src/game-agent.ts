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
import { stripTranslationsToSource } from "@dodi/games/translations";
import {
  BACKGROUND_IMAGE_PLACEHOLDER,
  extractBackgroundImage,
  hasBackgroundPlaceholder,
  injectBackgroundImage,
} from "@dodi/games/background-image";
import type { AgentCodeResult, AgentTaskRequest, GenerateGamePayload, UpdateGamePayload } from "@dodi/types/tasks";
import type { AgentActivityEvent, AgentStep } from "@dodi/types/agent-progress";
import type { AIProviderId } from "@dodi/types/ai";
import type { TokenUsage } from "@dodi/types/usage";

import { buildAgentSystemPrompt } from "./game-agent-prompt";
import { getModelOutputCap } from "./providers";
import {
  buildAgentTools,
  executeTool,
  renderReport,
  type LastWriteResult,
  type RenderGameInput,
  type RenderGameOutput,
  type ToolContext,
} from "./game-agent-tools";
import {
  createGameDriver,
  type DriverTranscript,
  type GameToolCall,
  type GameToolResult,
  type GameTurn,
  type PriorTurn,
} from "./game-agent-drivers";

export type { DriverTranscript, PriorTurn } from "./game-agent-drivers";

/**
 * Cost caps for a single game action. `MAX_TOKENS` is the per-write OUTPUT
 * ceiling and `MAX_VALIDATION_RETRIES` bounds the number of writes; together
 * they bound the worst-case cost of a generation. Raised 8k → 100k on
 * 2026-07-17 after prod builds truncated mid-`write_game_code` (error_logs
 * stopReason "max_tokens") — real bundles peak around 10-15k output tokens, so
 * this is deliberate headroom, not expected spend. The effective per-request
 * value is clamped to the model's own output cap (`getModelOutputCap`), since
 * requesting above a model's maximum is a 400 on Anthropic.
 *
 * `MAX_VISUAL_FIX_ROUNDS` bounds the turns the forced visual check may add
 * when the model never called view_game itself: two, so one turn can edit and
 * the next can validate (or retry a failed edit).
 */
export const AGENT_LIMITS = {
  MAX_AGENT_TURNS: 15,
  MAX_VALIDATION_RETRIES: 1,
  MAX_VISUAL_FIX_ROUNDS: 2,
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
   * Live activity callback (narration text deltas, tool starts, write
   * progress) driving the studio's narration line. Ephemeral — never persisted.
   */
  onActivity?: (event: AgentActivityEvent) => void;
  /**
   * Display language for the model's "working aloud" narration sentences (the
   * PARENT's UI language, not the child's game language — the studio is a
   * parent surface). Unset ⇒ the prompt omits the narration instruction.
   */
  narrationLanguage?: string;
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
  /**
   * Client-injected renderer: the account's screenshot service. Presence
   * enables the view_game tool AND a forced visual check after validation when
   * the model never looked itself. Receives the bundle with its background
   * injected; resolves null (never throws) when the service is unavailable.
   */
  onViewGame?: (input: RenderGameInput) => Promise<RenderGameOutput | null>;
  /**
   * Called at every turn boundary with the full loop state, so a build that the
   * OS or a reload interrupts can continue from its last completed turn instead
   * of starting over. The checkpoint carries the whole transcript (prompts,
   * code, images): callers seal it before storing it anywhere. Awaited; a throw
   * is ignored, since a missed checkpoint must never fail the build.
   */
  onCheckpoint?: (checkpoint: AgentCheckpoint) => Promise<void>;
  /**
   * Continue from a checkpoint instead of starting fresh. The caller passes the
   * same provider, task and callbacks as the interrupted run; the transcript
   * replaces the seeded first message and `priorTurns` is ignored.
   */
  resumeFrom?: AgentCheckpoint;
}

/** Which part of the loop the next model turn belongs to. */
export type AgentLoopPhase = "main" | "validation_fix" | "visual_fix";

/** The ToolContext fields that are run state; the callbacks are re-injected on resume. */
const TOOL_STATE_KEYS = [
  "existingCode",
  "existingMarkdown",
  "currentMeta",
  "carriedBackgroundImage",
  "freshBackgroundImage",
  "backgroundImageCalls",
  "backgroundImageFailed",
  "freshPreviewImage",
  "previewImageCalls",
  "previewImageFailed",
  "viewGameCalls",
  "viewGameFailed",
  "lastViewHadLayoutIssues",
] as const satisfies readonly (keyof ToolContext)[];

export type ToolRunState = Pick<ToolContext, (typeof TOOL_STATE_KEYS)[number]>;

export const AGENT_CHECKPOINT_VERSION = 1;

/**
 * Everything needed to continue a game build after its last completed model
 * turn: the provider transcript plus the loop's counters and tool state. Plain
 * JSON. Resuming replays at most the one turn that was in flight.
 */
export interface AgentCheckpoint {
  version: typeof AGENT_CHECKPOINT_VERSION;
  phase: AgentLoopPhase;
  /** Model turns already completed in `phase`; the resumed run starts the next. */
  phaseTurns: number;
  iterationCount: number;
  validationRetries: number;
  lastStopReason: string | null;
  sawToolCalls: boolean;
  sawText: boolean;
  usage: TokenUsage;
  lastWrite?: LastWriteResult;
  visualCheckFailed: boolean;
  tools: ToolRunState;
  transcript: DriverTranscript;
}

function toolRunState(context: ToolContext): ToolRunState {
  const state: ToolRunState = {};
  for (const key of TOOL_STATE_KEYS) {
    if (context[key] !== undefined) Object.assign(state, { [key]: context[key] });
  }
  return state;
}

/** How many of the most recent image-bearing user turns re-send their images. */
export const MAX_IMAGE_TURNS = 2;

/** Which studio step a tool call represents — applied both when the call
 *  starts streaming (early, via tool_started) and when it executes. */
const STEP_BY_TOOL: Partial<Record<string, AgentStep>> = {
  read_bridge_docs: "reading_docs",
  read_existing_game: "reading_docs",
  read_char_paths: "reading_docs",
  generate_background_image: "generating_image",
  use_uploaded_background: "generating_image",
  generate_preview_image: "generating_preview",
  write_game_code: "writing_code",
  edit_game_code: "writing_code",
  validate_game: "validating",
  view_game: "visual_check",
};

/**
 * Strip images from all but the most recent MAX_IMAGE_TURNS user turns so old
 * attachments stop costing image tokens on every subsequent build. The full
 * images stay in the sealed transcript for display — this only trims what is
 * re-fed to the model.
 */
export function trimPriorImages(turns: PriorTurn[] | undefined): PriorTurn[] | undefined {
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

/** The closing step of both task recipes when a screenshot service is on. */
const VISUAL_CHECK_STEP =
  "Look at the finished game with view_game and fix anything that looks wrong or is " +
  "broken (edit_game_code, then validate_game)";

function buildCodeTaskUserMessage(
  task: AgentTaskRequest,
  opts: { visualCheck: boolean },
): string {
  if (task.taskType === "generate_game") {
    const payload = task.payload as GenerateGamePayload;
    // An agreed plan came out of the studio's Plan step: the parent already
    // reviewed these mechanics, so it is a spec to implement, not an idea to
    // riff on.
    const lines = payload.isAgreedPlan
      ? [
          "Build the game described by this plan. The parent reviewed and approved it in the " +
            "studio's planning step: implement every mechanic, rule and progression step it " +
            "lists, and do not add features it does not mention.",
          "",
          payload.prompt,
        ]
      : ["Create a new game based on this description:", "", payload.prompt];
    if (payload.title) lines.push("", `Title: ${payload.title} (set by the parent — keep it)`);
    if (payload.tags?.length) lines.push(`Tags: ${payload.tags.join(", ")}`);
    if (payload.learningGoal) lines.push("", `Learning goal: ${payload.learningGoal}`);
    if (payload.successDefinition) lines.push(`Success definition: ${payload.successDefinition}`);
    if (payload.images?.length) {
      lines.push(
        "",
        payload.isAgreedPlan
          ? `${payload.images.length} image(s) are attached: the parent's sketch or photo of the ` +
            "intended game from the planning step. Read them for layout, pieces and mechanics — " +
            "they are not artwork to copy."
          : `${payload.images.length} reference image(s) are attached — use them as visual guidance.`,
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
    if (opts.visualCheck) lines.push(`5. ${VISUAL_CHECK_STEP}`);
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
    "2. Make the requested changes — use edit_game_code with exact-match snippets for " +
      "targeted changes (preferred), or write_game_code for a large overhaul (keep " +
      "progressKind + successCriteria in sync with the goal/success above)",
    "3. Validate with validate_game",
    "4. Fix any issues and re-validate if needed",
  );
  if (opts.visualCheck) lines.push(`5. ${VISUAL_CHECK_STEP}`);
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
    onActivity,
    narrationLanguage,
    onGenerateBackgroundImage,
    onPrepareBackgroundImage,
    onGeneratePreviewImage,
    hasExistingPreviewImage,
    onViewGame,
    onCheckpoint,
    resumeFrom,
  } = params;
  if (resumeFrom && resumeFrom.version !== AGENT_CHECKPOINT_VERSION) {
    throw new Error(`Unsupported game build checkpoint version ${String(resumeFrom.version)}`);
  }
  const emitStep = onStep ?? (() => {});
  const checkAborted = (): void => {
    if (signal?.aborted) throw new AgentAbortedError();
  };
  // Flip the step the moment the model STARTS a tool call — executeTool may be
  // minutes away while a big write_game_code input is still streaming.
  const emitActivity = (event: AgentActivityEvent): void => {
    if (event.type === "tool_started") {
      const step = STEP_BY_TOOL[event.name];
      if (step) emitStep(step);
    }
    onActivity?.(event);
  };
  // A mid-stream abort surfaces as a provider SDK error — normalize it so
  // pressing Stop never reads as a build failure. Every model turn opens a step
  // ("thinking" by default): a provider that delivers its tool call whole only
  // at the end of the turn would otherwise leave the previous tool's step on
  // screen for the whole generation.
  const runTurnChecked = async (
    driver: { runTurn(): Promise<GameTurn> },
    step: AgentStep = "thinking",
  ): Promise<GameTurn> => {
    emitStep(step);
    try {
      return await driver.runTurn();
    } catch (err) {
      if (signal?.aborted) throw new AgentAbortedError();
      throw err;
    }
  };

  const goalPayload = task.payload as Partial<GenerateGamePayload & UpdateGamePayload>;

  const driver = createGameDriver(provider, {
    apiKey,
    model,
    systemPrompt: buildAgentSystemPrompt({
      ...task.childContext,
      sourceLocale: task.childContext.locale ?? "en",
      perspective: goalPayload.perspective ?? null,
      narrationLanguage,
      visualCheck: Boolean(onViewGame),
    }),
    maxTokens: Math.min(AGENT_LIMITS.MAX_TOKENS, getModelOutputCap(provider, model)),
    tools: buildAgentTools({
      backgroundImage: Boolean(onGenerateBackgroundImage),
      uploadedImages: Boolean(goalPayload.images?.length),
      previewImage: Boolean(onGeneratePreviewImage),
      viewGame: Boolean(onViewGame),
    }),
    onActivity: emitActivity,
    signal,
  });

  // Update tasks preload the existing code so read_existing_game returns it —
  // with any inline background image swapped back to its placeholder so base64
  // never enters the model transcript (runs regardless of the current setting).
  const toolContext: ToolContext = {
    generateBackgroundImage: onGenerateBackgroundImage,
    prepareBackgroundImage: onPrepareBackgroundImage,
    generatePreviewImage: onGeneratePreviewImage,
    referenceImages: goalPayload.images,
    renderGame: onViewGame,
    perspective: goalPayload.perspective ?? null,
  };
  if (task.taskType === "update_game") {
    const payload = task.payload as UpdateGamePayload;
    const extracted = extractBackgroundImage(payload.existingCode);
    // A published/remixed bundle carries every platform locale; the model only
    // ever writes the source, so drop the rest (budget + tokens). Non-source
    // locales go stale on edit anyway — re-publishing re-translates.
    toolContext.existingCode = stripTranslationsToSource(extracted.code);
    toolContext.existingMarkdown = payload.existingMarkdown;
    // Baseline for edit-only runs: without it, surgical edits would hand back
    // placeholder metadata and the caller would persist it over the real values.
    const meta = payload.existingMeta;
    toolContext.currentMeta = {
      title: meta?.title ?? payload.title ?? "",
      description: meta?.description ?? "",
      tags: meta?.tags ?? [],
      progressKind: coerceProgressKind(meta?.progressKind),
      successCriteria: coerceSuccessCriteria(meta?.successCriteria),
      changeSummary: "",
      capabilities: meta?.capabilities ?? [],
    };
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
  // A screenshot service is configured: the model can (and should) look at
  // real frames of its game before finishing. If it doesn't, the loop looks
  // for it once and asks for fixes (see the forced check below).
  const viewNote = onViewGame
    ? "\n\nA visual check is available: after your final write + validate_game, call " +
      "view_game to SEE real screenshots of your game and fix anything that looks wrong or " +
      "is broken before you finish. If you skip it, the app renders the opening screen for " +
      "you and asks you to fix what it finds."
    : "";
  if (resumeFrom) {
    driver.restore(resumeFrom.transcript);
    Object.assign(toolContext, resumeFrom.tools);
  } else {
    driver.seed(trimPriorImages(priorTurns), {
      text:
        buildCodeTaskUserMessage(task, { visualCheck: Boolean(onViewGame) }) +
        carriedNote +
        backgroundNote +
        previewNote +
        viewNote,
      images: taskImages,
    });
  }

  const learningGoal = goalPayload.learningGoal ?? "";
  const successDefinition = goalPayload.successDefinition ?? "";

  let lastWrite: LastWriteResult | undefined = resumeFrom?.lastWrite;
  let iterationCount = resumeFrom?.iterationCount ?? 0;
  let validationRetries = resumeFrom?.validationRetries ?? 0;
  let lastStopReason: string | null = resumeFrom?.lastStopReason ?? null;
  let sawToolCalls = resumeFrom?.sawToolCalls ?? false;
  let sawText = resumeFrom?.sawText ?? false;
  let visualCheckFailed = resumeFrom?.visualCheckFailed ?? false;
  const startPhase: AgentLoopPhase = resumeFrom?.phase ?? "main";
  const startTurns = resumeFrom?.phaseTurns ?? 0;

  // Accumulate token usage across every model call (main loop + fix loop) so the
  // caller can report the true per-generation cost. Structural param type avoids
  // depending on the exact SDK usage type name.
  const usage: TokenUsage = resumeFrom
    ? { ...resumeFrom.usage }
    : { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

  // Called only between turns, when the transcript ends in a message the next
  // model turn answers, so a resume can start straight with runTurn.
  const checkpoint = async (phase: AgentLoopPhase, phaseTurns: number): Promise<void> => {
    if (!onCheckpoint) return;
    try {
      await onCheckpoint({
        version: AGENT_CHECKPOINT_VERSION,
        phase,
        phaseTurns,
        iterationCount,
        validationRetries,
        lastStopReason,
        sawToolCalls,
        sawText,
        usage: { ...usage },
        lastWrite,
        visualCheckFailed,
        tools: toolRunState(toolContext),
        transcript: driver.snapshot(),
      });
    } catch {
      // A missed checkpoint only costs resumability, never the build.
    }
  };
  const addUsage = (u: TokenUsage): void => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheWriteTokens += u.cacheWriteTokens;
    usage.cacheReadTokens += u.cacheReadTokens;
  };

  const runToolTurn = async (call: GameToolCall): Promise<GameToolResult> => {
    const step = STEP_BY_TOOL[call.name];
    if (step) emitStep(step);
    const { result, writeResult, images } = await executeTool(call.name, call.input, toolContext);
    if (writeResult) {
      lastWrite = writeResult;
      toolContext.existingCode = writeResult.code;
      toolContext.existingMarkdown = writeResult.markdown;
      // Edits build on the latest metadata; a full write resets the summary.
      const { code: _code, markdown: _markdown, ...meta } = writeResult;
      toolContext.currentMeta = meta;
    }
    return images?.length ? { id: call.id, content: result, images } : { id: call.id, content: result };
  };

  // A fresh run is resumable from its very first turn: an interruption while
  // that turn is in flight then costs one turn, not the build.
  if (!resumeFrom) await checkpoint("main", 0);

  // Agentic loop (skipped when resuming into a later phase)
  for (
    let turn = startPhase === "main" ? startTurns : AGENT_LIMITS.MAX_AGENT_TURNS;
    turn < AGENT_LIMITS.MAX_AGENT_TURNS;
    turn++
  ) {
    checkAborted();
    const result = await runTurnChecked(driver);
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
          "Please use the write_game_code tool to provide the game code (or " +
            "edit_game_code for targeted changes to code that already exists), " +
            "then validate_game to verify it. Do not output code as text.",
        );
        await checkpoint("main", turn + 1);
        continue;
      }
      break;
    }

    // Promise.all preserves order, so each tool_use id gets its matching result.
    const toolResults = await Promise.all(result.toolCalls.map(runToolTurn));
    driver.addToolResults(toolResults);

    if (!result.expectsToolResults) break;
    await checkpoint("main", turn + 1);
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
    requireTranslations: true,
    // "Image available": generated this run, or carried AND still referenced (a
    // carried background may be dropped deliberately — never an error).
    hasBackgroundImage:
      toolContext.freshBackgroundImage !== undefined ||
      (toolContext.carriedBackgroundImage !== undefined &&
        hasBackgroundPlaceholder(lastWrite!.code)),
  });

  // Final validation with a bounded fix loop. A resume into the fix loop skips
  // the check that opened it; a resume past it skips the loop.
  let firstRetry: number = AGENT_LIMITS.MAX_VALIDATION_RETRIES;
  if (startPhase === "validation_fix") {
    firstRetry = startTurns;
  } else if (startPhase === "main") {
    const validation = validateGameCode(lastWrite.code, goalOpts());
    if (!validation.valid && validationRetries < AGENT_LIMITS.MAX_VALIDATION_RETRIES) {
      driver.addUserMessage(
        `Final validation failed with errors:\n${validation.errors.join("\n")}\n\n` +
          `Please fix these issues — with edit_game_code for targeted fixes, or ` +
          `write_game_code for a rewrite — then validate_game.`,
      );
      await checkpoint("validation_fix", 0);
      firstRetry = 0;
    }
  }

  for (let retry = firstRetry; retry < AGENT_LIMITS.MAX_VALIDATION_RETRIES; retry++) {
    checkAborted();
    validationRetries++;
    const fix = await runTurnChecked(driver, "fixing_validation");
    iterationCount++;
    addUsage(fix.usage);

    if (fix.toolCalls.length === 0) break;

    const fixResults = await Promise.all(fix.toolCalls.map(runToolTurn));
    driver.addToolResults(fixResults);

    const recheck = validateGameCode(lastWrite.code, goalOpts());
    if (recheck.valid) break;
    await checkpoint("validation_fix", retry + 1);
  }

  // Forced visual check. Runs when a screenshot service is on and either the
  // model finished without ever looking at its game, or its last look measured
  // layout collisions (a fix it never re-checked, or collisions it ignored).
  // Render the final code, hand the frames over with the rubric, and give it a
  // bounded number of turns to fix what it sees. A clean re-check ends quietly
  // without a model turn. A failed render never fails the build; the studio
  // shows a notice instead. Runs before the final validation so a fix here is
  // validated too. A resume into the fix rounds skips the render that opened them.
  let firstRound: number = AGENT_LIMITS.MAX_VISUAL_FIX_ROUNDS;
  if (startPhase === "visual_fix") {
    firstRound = startTurns;
  } else {
    visualCheckFailed = Boolean(toolContext.viewGameFailed);
    const neverLooked = !toolContext.viewGameCalls;
    if (onViewGame && (neverLooked || toolContext.lastViewHadLayoutIssues)) {
      checkAborted();
      emitStep("visual_check");
      const background = toolContext.freshBackgroundImage ?? toolContext.carriedBackgroundImage;
      const output = await onViewGame({
        code: background ? injectBackgroundImage(lastWrite.code, background) : lastWrite.code,
        steps: [],
      }).catch(() => null);
      const hasFindings =
        output !== null &&
        (neverLooked || !output.ready || output.errors.length > 0 || Boolean(output.layoutIssues?.length));
      if (!output) {
        visualCheckFailed = true;
      } else if (hasFindings) {
        driver.addUserMessage({
          text:
            (neverLooked
              ? "You finished without calling view_game, so the app rendered your game for you.\n\n"
              : "Your last view_game measured layout collisions, so the app rendered your final " +
                "code again before finishing.\n\n") +
            renderReport(output, goalPayload.perspective ?? null) +
            "\n\nIf every check passes, answer with one short sentence and no tool call. " +
            "Otherwise fix the misses with edit_game_code, then validate_game.",
          images: output.frames.map((frame) => frame.image),
        });
        await checkpoint("visual_fix", 0);
        firstRound = 0;
      }
    }
  }

  for (let round = firstRound; round < AGENT_LIMITS.MAX_VISUAL_FIX_ROUNDS; round++) {
    checkAborted();
    const fix = await runTurnChecked(driver);
    iterationCount++;
    addUsage(fix.usage);
    if (fix.toolCalls.length === 0) break;
    const fixResults = await Promise.all(fix.toolCalls.map(runToolTurn));
    driver.addToolResults(fixResults);
    if (!fix.expectsToolResults) break;
    await checkpoint("visual_fix", round + 1);
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
    visualCheckFailed: visualCheckFailed || undefined,
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
