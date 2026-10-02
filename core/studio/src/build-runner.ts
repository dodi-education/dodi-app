/**
 * One Game Studio build, start to finish, with no UI attached: assemble the
 * agent task from the studio's state, run the game agent on the device with
 * the vault-resolved key, then inject, sanitize, seal and persist the result.
 *
 * This used to live inside the web studio component, which tied a build's
 * life to that component: leaving the page killed it. Running it here lets a
 * build outlive any screen (the build manager owns it), lets the mobile app
 * run it as a background task, and keeps web and mobile on one implementation.
 * Everything platform-specific comes in through `StudioPorts`.
 */

import { AgentAbortedError, GameAgentError, runGameAgent } from "@dodi/ai/game-agent";
import type { AgentCheckpoint } from "@dodi/ai/game-agent";
import type { RenderGameInput, RenderGameOutput } from "@dodi/ai/game-agent-tools";
import { calculateChildAge, getLanguageDisplayName } from "@dodi/ai/dodi-context";
import { buildLearningContext, measureLearningContext } from "@dodi/ai/learning-context";
import { createClientImageProvider } from "@dodi/ai/image-providers/factory";
import { buildBackgroundPrompt } from "@dodi/ai/image-providers/background-prompt";
import { buildPreviewPrompt } from "@dodi/ai/image-providers/preview-prompt";
import { injectBackgroundImage } from "@dodi/games/background-image";
import { gameDebugWarn } from "@dodi/games/debug";
import type { ProgressKind, SuccessCriteria } from "@dodi/games/success";
import { sanitizeGameBundle } from "@dodi/games/sanitizer";
import { STAGE } from "@dodi/games/stage";
import { normalizeLocale } from "@dodi/intl/locales";
import type { AgentActivityEvent, AgentStep } from "@dodi/types/agent-progress";
import type { Game, Json } from "@dodi/types/database";
import type { GamePerspective } from "@dodi/types/games";
import type {
  AgentCodeResult,
  AgentTaskRequest,
  GenerateGamePayload,
  UpdateGamePayload,
} from "@dodi/types/tasks";
import { decryptGame, encryptGameFields } from "@dodi/vault/game-crypto";
import type { VaultSession } from "@dodi/vault";

import type { AgentRunLog, AgentRunOutcome } from "./agent-run-log";
import { createAgentRunRecorder, RUN_FRAME_BOUND } from "./agent-run-recorder";
import {
  saveBuildCheckpoint,
  STUDIO_CHECKPOINT_VERSION,
  type StudioBuildCheckpoint,
} from "./build-checkpoint";
import { readError } from "./http";
import type { BuildRenderer, ImageOps, ResolvedExecution, StudioPorts } from "./ports";
import { sealTranscript, type StudioChatMessage, toPriorTurns } from "./transcript";

/** The studio's view of the game that a build reads as its baseline. */
export interface StudioBuildGame {
  title: string;
  tags: string[];
  description: string;
  learningGoal: string;
  successDefinition: string;
  progressKind: ProgressKind;
  /** Structured success mapping — the baseline edit-only builds must preserve. */
  successCriteria: SuccessCriteria;
  codeBundle: string;
  markdown: string;
  /** Specific kid IDs this game is shared with (empty when family). */
  audienceIds: string[];
  /** Shared with the whole family. */
  isFamily: boolean;
  /** Dodi has built this game at least once (false for a freshly-saved draft). */
  built: boolean;
  /** Required camera perspective for the design (null = dodi chooses). */
  perspective: GamePerspective | null;
  /** Generate an AI background image during builds (needs an image provider). */
  generateBackgroundImage: boolean;
  /** Generate an AI game-list preview image after builds (needs an image provider). */
  generatePreviewImage: boolean;
  /** Standard commands the built game implements (metadata.capabilities). */
  capabilities: string[];
  /** 100×100 JPEG data URL shown in game lists (null = none yet). */
  previewImage: string | null;
}

/** Just the build baseline of a richer game object (keeps checkpoints lean). */
export function toBuildGame(game: StudioBuildGame): StudioBuildGame {
  return {
    title: game.title,
    tags: game.tags,
    description: game.description,
    learningGoal: game.learningGoal,
    successDefinition: game.successDefinition,
    progressKind: game.progressKind,
    successCriteria: game.successCriteria,
    codeBundle: game.codeBundle,
    markdown: game.markdown,
    audienceIds: game.audienceIds,
    isFamily: game.isFamily,
    built: game.built,
    perspective: game.perspective,
    generateBackgroundImage: game.generateBackgroundImage,
    generatePreviewImage: game.generatePreviewImage,
    capabilities: game.capabilities,
    previewImage: game.previewImage,
  };
}

/** A kid as the vault decrypted it: the agent's context is assembled on the device. */
export interface StudioKid {
  id: string;
  name: string;
  birthdate: string | null;
  memory: string | null;
  parent_notes: string | null;
  /** Operational (non-encrypted) locale, used for the agent's output language. */
  language: string;
}

/** Localized replies the build writes into the thread (the parent's UI language). */
export interface StudioBuildTexts {
  /** Heading above the model's change summary. */
  buildSummaryTitle: string;
  stopped: string;
  paused: string;
  buildFailed: string;
  previewUpdated: string;
  previewUpdateFailed: string;
}

export interface StudioBuildInput {
  gameId: string;
  game: StudioBuildGame;
  /** The parent's message. */
  text: string;
  /** Reference images attached to this message (downscaled data URLs). */
  images: string[];
  /** The message is a plan the parent approved — build it, don't reinterpret it. */
  isAgreedPlan?: boolean;
  /** Edits only: a capture of the game as it looks now (taken by the UI). */
  screenshot?: string;
  /** The thread before this message. */
  history: StudioChatMessage[];
  kids: StudioKid[];
  primaryKidId: string;
  /** The parent's UI locale: the language dodi narrates its work in. */
  narrationLocale: string;
  texts: StudioBuildTexts;
}

export type BuildNotice = "skipped" | "failed" | null;

export type StudioBuildOutcome =
  /** No game model or key is configured: nothing ran. */
  | { kind: "no_provider"; transcript: StudioChatMessage[] }
  | {
      kind: "built";
      transcript: StudioChatMessage[];
      result: AgentCodeResult;
      /** The bundle as persisted: background injected, sanitized. */
      code: string;
      isCodeChanged: boolean;
      /** The persisted, decrypted row; null when the save failed. */
      savedRow: Game | null;
      /** Set when persisting failed: the server's reason, or "" when unknown. */
      saveError?: string;
      backgroundNotice: BuildNotice;
      previewNotice: BuildNotice;
      hasVisualCheckNotice: boolean;
    }
  | {
      kind: "preview_only";
      transcript: StudioChatMessage[];
      /** The new list preview; null when generating it failed. */
      previewImage: string | null;
      saveError?: string;
    }
  /** The parent pressed Stop. */
  | { kind: "stopped"; transcript: StudioChatMessage[] }
  /** The OS (or the app) paused the build; its checkpoint is kept for resume. */
  | { kind: "paused"; transcript: StudioChatMessage[] }
  /** `isResumable`: a checkpoint survived, so the build can continue from it. */
  | { kind: "failed"; transcript: StudioChatMessage[]; isResumable: boolean };

/** Live progress, for whatever UI happens to be watching. */
export interface BuildProgressSink {
  onStep?: (step: AgentStep) => void;
  onActivity?: (event: AgentActivityEvent) => void;
  onRunLog?: (log: AgentRunLog) => void;
}

export interface RunStudioBuildOptions extends BuildProgressSink {
  signal?: AbortSignal;
  /** True when an abort means "pause" (keep the checkpoint) rather than Stop. */
  isPauseRequested?: () => boolean;
  /** Continue this checkpoint instead of starting fresh. */
  resumeFrom?: StudioBuildCheckpoint;
}

/** Square edge of the game-list preview the generated image is cropped to. */
const PREVIEW_IMAGE_SIZE = 100;
/** Bound for the edit-time screenshot (also the screenshot-service frame bound). */
export const SCREENSHOT_BOUND = { maxWidth: 768, maxHeight: 960, quality: 0.8 } as const;
/** Background images heavier than this (~120KB binary) are recompressed once. */
const MAX_BACKGROUND_CHARS = 160_000;

/**
 * Bound an image for the bundle: downscale to the stage size, recompress once
 * if it's still heavy.
 */
export async function boundBackgroundImage(images: ImageOps, dataUrl: string): Promise<string> {
  const bound = { maxWidth: STAGE.logicalWidth, maxHeight: STAGE.logicalHeight };
  let scaled = await images.downscale(dataUrl, { ...bound, quality: 0.8 });
  if (scaled && scaled.length > MAX_BACKGROUND_CHARS) {
    scaled = await images.downscale(dataUrl, { ...bound, quality: 0.6 });
  }
  if (!scaled) throw new Error("Background image processing failed");
  return scaled;
}

async function resolveImageProvider(ports: StudioPorts) {
  const image = await ports.execution.resolveImage();
  if (!image) throw new Error("No image provider configured");
  return createClientImageProvider(image.provider, image.apiKey, image.model);
}

/** The agent task for this message: generate on the first build, update after. */
export function buildAgentTask(input: StudioBuildInput): AgentTaskRequest {
  const { game, kids, primaryKidId } = input;
  const attachments = input.images.length ? input.images : undefined;
  const payload: GenerateGamePayload | UpdateGamePayload = game.built
    ? {
        instruction: input.text,
        screenshot: input.screenshot,
        existingCode: game.codeBundle,
        existingMarkdown: game.markdown,
        // Baseline for surgical edits: an edit-only build returns these
        // unchanged, so the persist cannot wipe them.
        existingMeta: {
          title: game.title,
          description: game.description,
          tags: game.tags,
          progressKind: game.progressKind,
          successCriteria: game.successCriteria,
          capabilities: game.capabilities,
        },
        title: game.title || undefined,
        learningGoal: game.learningGoal || undefined,
        successDefinition: game.successDefinition || undefined,
        perspective: game.perspective ?? undefined,
        images: attachments,
      }
    : {
        prompt: input.text,
        isAgreedPlan: input.isAgreedPlan || undefined,
        title: game.title || undefined,
        tags: game.tags,
        learningGoal: game.learningGoal || undefined,
        successDefinition: game.successDefinition || undefined,
        perspective: game.perspective ?? undefined,
        images: attachments,
      };
  const kid = kids.find((k) => k.id === primaryKidId);
  return {
    kidId: primaryKidId,
    taskType: game.built ? "update_game" : "generate_game",
    gameId: input.gameId,
    // Memory/parent-notes, birthdate and name are E2EE — the context is
    // assembled on the device and only ever goes to the provider directly.
    childContext: {
      name: kid?.name ?? "",
      age: calculateChildAge(kid?.birthdate ?? null) ?? undefined,
      language: getLanguageDisplayName(kid?.language ?? "en"),
      locale: normalizeLocale(kid?.language),
      learningContext: buildLearningContext(
        kids,
        { isFamily: game.isFamily, audienceIds: game.audienceIds },
        primaryKidId,
      ),
    },
    payload,
  };
}

/**
 * The reply under the parent's message. The summary contract is bullet lines
 * only; the client owns the title above the list (localized), so a
 * model-authored heading line (non-bullet first line ending in ":") is dropped.
 */
export function buildReplyText(
  result: AgentCodeResult,
  isUpdate: boolean,
  texts: StudioBuildTexts,
): string {
  const summary = (result.changeSummary ?? "")
    .trim()
    .replace(/^\s*[^-\n][^\n]*:\**\s*\n+/, "")
    .trim();
  if (summary) return `${texts.buildSummaryTitle}\n${summary}`;
  return isUpdate
    ? `Updated **${result.title}** — the preview and code are refreshed.`
    : `Here's **${result.title}** — it's live in the preview; flip to Code to see what I wrote.`;
}

async function patchGame(
  ports: StudioPorts,
  gameId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const res = await ports.api.request(`/api/games/${gameId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res;
}

/**
 * Persist a completed build: sealed game fields + sealed transcript. The
 * server appends a version for the new bundle. Returns the decrypted row.
 */
async function persistBuild(
  ports: StudioPorts,
  session: VaultSession,
  input: StudioBuildInput,
  result: AgentCodeResult,
  code: string,
  transcript: StudioChatMessage[],
): Promise<Game> {
  const sealed = encryptGameFields(session, {
    title: result.title || undefined,
    description: result.description,
    code_bundle: code,
    markdown: result.markdown,
    learning_goal: result.learningGoal,
    success_definition: result.successDefinition,
    success_criteria: result.successCriteria as unknown as Json,
    // The agent-generated list preview rides along with the build persist.
    ...(result.previewImage ? { preview_image: result.previewImage } : {}),
  });
  const res = await patchGame(ports, input.gameId, {
    ...sealed,
    tags: result.tags,
    progress_kind: result.progressKind,
    metadata: result.metadata,
    agent_transcript_enc: sealTranscript(session, transcript),
    audience: { isFamily: input.game.isFamily, audienceIds: input.game.audienceIds },
  });
  const saved = decryptGame(session, (await res.json()) as Game);
  ports.games.put(saved);
  return saved;
}

export async function runStudioBuild(
  input: StudioBuildInput,
  ports: StudioPorts,
  options: RunStudioBuildOptions = {},
): Promise<StudioBuildOutcome> {
  const { game, gameId, primaryKidId, texts } = input;
  const { resumeFrom } = options;
  const now = ports.now ?? Date.now;
  const isUpdate = game.built;
  const withUser: StudioChatMessage[] = [
    ...input.history,
    { role: "user", text: input.text, ...(input.images.length ? { images: input.images } : {}) },
  ];

  // Record what the agent does this build (steps, narration, screenshot
  // checks) for the "How dodi built this" timeline under its reply.
  const recorder = createAgentRunRecorder({
    onChange: (log) => options.onRunLog?.(log),
    thumbnail: (url) => ports.images.downscale(url, RUN_FRAME_BOUND),
    now,
    initial: resumeFrom?.runLog,
  });
  const reply = (text: string, outcome: AgentRunOutcome, extra: Partial<StudioChatMessage> = {}) =>
    [...withUser, { role: "assistant" as const, text, ...extra, run: recorder.finish(outcome) }];

  // Failure telemetry inputs: the loop runs entirely on the device, so the
  // report below is the only trace a failed build leaves anywhere.
  const startedAt = resumeFrom?.startedAt ?? now();
  let lastStep: AgentStep | null = null;
  let execution: ResolvedExecution | null = null;
  let hasCheckpoint = Boolean(resumeFrom);
  const clearCheckpoint = async (): Promise<void> => {
    if (!hasCheckpoint || !ports.checkpoints) return;
    hasCheckpoint = false;
    await ports.checkpoints.clear(gameId).catch(() => {});
  };

  try {
    // The provider key lives only in the unlocked vault — resolve it here and
    // run the ENTIRE agent loop on the device, so it never reaches our servers.
    execution = await ports.execution.resolveGame();
    if (!execution) return { kind: "no_provider", transcript: withUser };
    const exec = execution;
    // A transcript only continues with the provider that wrote it.
    if (resumeFrom && resumeFrom.provider !== exec.provider) {
      await clearCheckpoint();
      throw new Error("The game model changed since this build was interrupted");
    }
    const session = await ports.session();

    const { texts: _texts, ...storableInput } = input;
    const onCheckpoint = ports.checkpoints
      ? async (agent: AgentCheckpoint): Promise<void> => {
          await saveBuildCheckpoint(ports.checkpoints!, session, {
            version: STUDIO_CHECKPOINT_VERSION,
            savedAt: now(),
            startedAt,
            input: storableInput,
            provider: exec.provider,
            model: exec.model,
            agent,
            runLog: recorder.current(),
          });
          hasCheckpoint = true;
        }
      : undefined;

    const renderer: BuildRenderer | null = ports.screenshots.forBuild();
    const viewGame = renderer
      ? recorder.wrapViewGame((renderInput: RenderGameInput): Promise<RenderGameOutput | null> =>
          renderer.viewGame(renderInput),
        )
      : undefined;

    const result = await runGameAgent({
      provider: exec.provider,
      apiKey: exec.apiKey,
      model: exec.model,
      task: buildAgentTask(input),
      priorTurns: toPriorTurns(input.history),
      signal: options.signal,
      onStep: (step) => {
        lastStep = step;
        recorder.onStep(step);
        options.onStep?.(step);
      },
      onActivity: (event) => {
        recorder.onActivity(event);
        options.onActivity?.(event);
      },
      // Narration is for the parent watching the studio — their UI language.
      narrationLanguage: getLanguageDisplayName(input.narrationLocale),
      onGenerateBackgroundImage: game.generateBackgroundImage
        ? async (scene) => {
            const provider = await resolveImageProvider(ports);
            const generated = await provider.generateImage(
              buildBackgroundPrompt(scene, game.perspective),
              { aspectRatio: `${STAGE.aspectW}:${STAGE.aspectH}` },
            );
            return boundBackgroundImage(ports.images, generated.dataUrl);
          }
        : undefined,
      // Independent of the generate toggle: "use my attached image as the
      // background" needs no image provider, just the bundle-size bound.
      onPrepareBackgroundImage: (dataUrl) => boundBackgroundImage(ports.images, dataUrl),
      // The game's background (when one exists) rides along as a style
      // reference; the result is cropped to the list-preview square here.
      onGeneratePreviewImage: game.generatePreviewImage
        ? async (scene, backgroundImage) => {
            const provider = await resolveImageProvider(ports);
            const generated = await provider.generateImage(
              buildPreviewPrompt(scene, { hasStyleReference: Boolean(backgroundImage) }),
              { aspectRatio: "1:1", referenceImages: backgroundImage ? [backgroundImage] : undefined },
            );
            const square = await ports.images.squareThumbnail(generated.dataUrl, PREVIEW_IMAGE_SIZE);
            if (!square) {
              gameDebugWarn("preview", "cropping the generated preview image failed");
              throw new Error("Preview image processing failed");
            }
            return square;
          }
        : undefined,
      hasExistingPreviewImage: Boolean(game.previewImage),
      // Only when a screenshot service resolves now: with none, the model
      // never even sees the view_game tool.
      onViewGame: viewGame,
      onCheckpoint,
      resumeFrom: resumeFrom?.agent,
    });
    // The agent is done: nothing is left to resume, whatever the persist does.
    await clearCheckpoint();

    // Preview-only run: the parent asked for a new preview image and nothing
    // else changed — persist just the preview + transcript, leave the game
    // fields and version chain untouched.
    if (result.previewOnly) {
      if (!result.previewImage) {
        const transcript = reply(texts.previewUpdateFailed, "failed");
        await patchGame(ports, gameId, {
          agent_transcript_enc: sealTranscript(session, transcript),
        }).catch(() => {
          /* best effort — the visible thread already has the reply */
        });
        return { kind: "preview_only", transcript, previewImage: null };
      }
      const preview = result.previewImage;
      const transcript = reply(texts.previewUpdated, "completed");
      ports.telemetry.reportUsage({
        eventType: "game_edit",
        kidId: primaryKidId,
        gameId,
        provider: exec.provider,
        model: exec.model,
        usage: result.usage,
        meta: { turns: result.iterationCount },
      });
      try {
        const sealed = encryptGameFields(session, { preview_image: preview });
        await patchGame(ports, gameId, {
          preview_image: sealed.preview_image,
          agent_transcript_enc: sealTranscript(session, transcript),
        });
        ports.games.patchLocal(gameId, { preview_image: preview });
        return { kind: "preview_only", transcript, previewImage: preview };
      } catch (saveErr) {
        return {
          kind: "preview_only",
          transcript,
          previewImage: preview,
          saveError: saveErr instanceof Error ? saveErr.message : "",
        };
      }
    }

    // Swap the background placeholder for the real image BEFORE anything
    // renders or persists — the stored bundle stays self-contained. Then
    // sanitize on the device (the games route sanitizes again server-side).
    const finalCode = result.backgroundImage
      ? injectBackgroundImage(result.codeBundle, result.backgroundImage)
      : result.codeBundle;
    const code = sanitizeGameBundle(finalCode).code;
    // Mirrors the server's previous-version capture in updateCustomGame: a
    // non-empty pre-build bundle that differs from the result. Anchors the
    // Show changes | Revert links on this turn's reply.
    const isCodeChanged = Boolean(game.codeBundle) && code !== game.codeBundle;

    // Record what this generation used (fire-and-forget). The tokens were
    // spent regardless of whether the persist below succeeds. Only sizes of
    // each context component are measured, never their content.
    const ctxSizes = measureLearningContext(
      input.kids,
      { isFamily: game.isFamily, audienceIds: game.audienceIds },
      primaryKidId,
    );
    ports.telemetry.reportUsage({
      eventType: isUpdate ? "game_edit" : "game_create",
      kidId: primaryKidId,
      gameId,
      provider: exec.provider,
      model: exec.model,
      usage: result.usage,
      meta: {
        turns: result.iterationCount,
        validationRetries: result.validationRetries,
        outputChars: code.length,
        memoryChars: ctxSizes.memoryChars,
        parentNotesChars: ctxSizes.parentNotesChars,
        learningGoalChars: game.learningGoal.length,
        successDefChars: game.successDefinition.length,
        promptChars: input.text.length,
        tagsChars: isUpdate ? 0 : game.tags.join(", ").length,
      },
    });

    const transcript = reply(
      buildReplyText(result, isUpdate, texts),
      result.validationPassed ? "completed" : "validation_failed",
      isCodeChanged ? { hasCodeChange: true } : {},
    );
    // A preview was expected but never landed. With an existing preview,
    // skipping the regeneration is a correct, deliberate choice — only a
    // failed attempt is worth a notice then.
    const previewNotice: BuildNotice =
      game.generatePreviewImage && !result.previewImage
        ? result.previewImageFailed
          ? "failed"
          : game.previewImage
            ? null
            : "skipped"
        : null;
    const built = {
      kind: "built" as const,
      transcript,
      result,
      code,
      isCodeChanged,
      backgroundNotice: (game.generateBackgroundImage && !result.backgroundImage
        ? result.backgroundImageFailed
          ? "failed"
          : "skipped"
        : null) as BuildNotice,
      previewNotice,
      hasVisualCheckNotice:
        Boolean(result.visualCheckFailed) && !(renderer?.wasServiceUnavailable() ?? false),
    };

    try {
      const savedRow = await persistBuild(ports, session, input, result, code, transcript);
      return { ...built, savedRow };
    } catch (saveErr) {
      ports.telemetry.reportError({
        context: "game_save",
        kidId: primaryKidId,
        gameId,
        provider: exec.provider,
        model: exec.model,
        error: saveErr,
        secrets: [exec.apiKey],
      });
      return {
        ...built,
        savedRow: null,
        saveError: saveErr instanceof Error ? saveErr.message : "",
      };
    }
  } catch (err) {
    // An abort is the parent pressing Stop, or the OS pausing the build —
    // neither is dressed up as a failure.
    if (err instanceof AgentAbortedError || options.signal?.aborted) {
      if (options.isPauseRequested?.() && hasCheckpoint) {
        return { kind: "paused", transcript: reply(texts.paused, "stopped") };
      }
      await clearCheckpoint();
      return { kind: "stopped", transcript: reply(texts.stopped, "stopped") };
    }
    // The parent sees only the generic message (no server/provider errors
    // bubble up) — the real error goes to telemetry, where the meta separates
    // a killed connection from a truncated write (stopReason max_tokens) or a
    // provider API error (httpStatus).
    const diag = err instanceof GameAgentError ? err.diagnostics : null;
    // A model that never wrote code is not worth resuming; a dropped
    // connection is exactly what checkpoints are for.
    if (diag) await clearCheckpoint();
    ports.telemetry.reportError({
      context: isUpdate ? "game_update" : "game_build",
      kidId: primaryKidId,
      gameId,
      provider: execution?.provider,
      model: execution?.model,
      error: err,
      secrets: execution ? [execution.apiKey] : [],
      meta: {
        durationMs: now() - startedAt,
        lastStep: lastStep ?? undefined,
        ...(diag
          ? {
              turns: diag.turns,
              stopReason: diag.lastStopReason ?? undefined,
              sawToolCalls: diag.sawToolCalls,
              sawText: diag.sawText,
            }
          : {}),
      },
    });
    return {
      kind: "failed",
      transcript: reply(texts.buildFailed, "failed"),
      isResumable: hasCheckpoint,
    };
  }
}
