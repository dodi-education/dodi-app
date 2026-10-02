/**
 * The studio's Plan step, minus the screen: one brainstorming turn with the
 * plan agent, accepting a plan (deriving the settings from it), and keeping
 * the Plan step persisted on the game row (`games.plan_enc`, sealed).
 *
 * Plan turns run on the device with the vault-resolved game key, exactly like
 * a build; they produce prose and, usually, a plan proposal, never code.
 */

import { calculateChildAge, getLanguageDisplayName } from "@dodi/ai/dodi-context";
import { AgentAbortedError } from "@dodi/ai/game-agent";
import { runPlanAgent } from "@dodi/ai/game-plan-agent";
import { buildLearningContext, measureLearningContext } from "@dodi/ai/learning-context";
import { derivePlanSettings, type PlanSettings } from "@dodi/ai/plan-settings";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";
import type { AgentActivityEvent } from "@dodi/types/agent-progress";
import type { Game } from "@dodi/types/database";
import {
  decryptGame,
  encryptGameCreateFields,
  encryptGameFields,
} from "@dodi/vault/game-crypto";

import { isValidAgeRange } from "./age-range";
import type { StudioKid } from "./build-runner";
import { sendJson } from "./http";
import type { PlanningState } from "./plan-state";
import type { ResolvedExecution, StudioEditorPorts } from "./ports";
import type { StudioGame } from "./studio-game";
import { sealTranscript, type StudioChatMessage, toPriorTurns } from "./transcript";

// ----- One plan turn ------------------------------------------------------

/** Localized replies a plan turn writes into the thread (the parent's UI language). */
export interface PlanTurnTexts {
  /** Reply when the model only proposed a plan and said nothing. */
  planProposedFallback: string;
  /** Appended to the reply when the turn put a (new) plan on the table. */
  planUpdatedNote: string;
  stopped: string;
  planFailed: string;
}

export interface PlanTurnInput {
  /** The parent's message. */
  text: string;
  /** Images riding this message (the fresh sketch/photo first, then staged ones). */
  attachments: string[];
  /** The thread before this message. */
  history: StudioChatMessage[];
  /** The plan on the table, so a revision rewrites it in full (null = none yet). */
  currentPlan: string | null;
  kids: StudioKid[];
  primaryKidId: string | null;
  /** The parent's UI locale: dodi answers in the parent's language. */
  replyLocale: string;
  /** The game id as of now (null until the first planning write created the row). */
  gameId: () => string | null;
  texts: PlanTurnTexts;
}

export interface PlanTurnOptions {
  /** Stop button / navigation. */
  signal?: AbortSignal;
  /** Live activity: the reply streams into the thinking line. */
  onActivity?: (event: AgentActivityEvent) => void;
}

export type PlanTurnOutcome =
  /** No game model or key resolved: nothing ran. */
  | { kind: "no_provider" }
  | {
      kind: "replied";
      /** The proposed plan's summary, or null when the model just talked. */
      plan: string | null;
      /** dodi's reply for the thread; null when the model said nothing at all. */
      reply: StudioChatMessage | null;
    }
  /** Stopped by the parent: `reply` says so in the thread. */
  | { kind: "stopped"; reply: StudioChatMessage }
  /** Failed (already reported): `reply` says so in the thread. */
  | { kind: "failed"; reply: StudioChatMessage };

/**
 * One brainstorming turn with the plan agent. No audience is chosen during
 * planning, so the child context spans the whole family: the plan should fit
 * whoever ends up playing it.
 */
export async function runPlanTurn(
  ports: Pick<StudioEditorPorts, "execution" | "telemetry" | "now">,
  input: PlanTurnInput,
  options: PlanTurnOptions = {},
): Promise<PlanTurnOutcome> {
  const now = ports.now ?? Date.now;
  const { kids, primaryKidId, text, attachments, texts } = input;
  const startedAt = now();
  let execution: ResolvedExecution | null = null;
  try {
    execution = await ports.execution.resolveGame();
    if (!execution) return { kind: "no_provider" };

    const kid = kids.find((k) => k.id === primaryKidId);
    const familyAudience = { isFamily: true, audienceIds: [] };
    const learningContext = buildLearningContext(kids, familyAudience, primaryKidId ?? "");

    const result = await runPlanAgent({
      provider: execution.provider,
      apiKey: execution.apiKey,
      model: execution.model,
      childContext: {
        age: calculateChildAge(kid?.birthdate ?? null) ?? undefined,
        language: getLanguageDisplayName(kid?.language ?? "en"),
        learningContext,
      },
      priorTurns: toPriorTurns(input.history),
      message: { text, images: attachments.length ? attachments : undefined },
      currentPlan: input.currentPlan,
      // The studio is a parent surface — dodi answers in the parent's language.
      replyLanguage: getLanguageDisplayName(input.replyLocale),
      signal: options.signal,
      onActivity: options.onActivity,
    });

    const ctxSizes = measureLearningContext(kids, familyAudience, primaryKidId ?? "");
    ports.telemetry.reportUsage({
      eventType: "game_plan",
      kidId: primaryKidId,
      // Null on the very first turn: the row is created right after it.
      gameId: input.gameId(),
      provider: execution.provider,
      model: execution.model,
      usage: result.usage,
      meta: {
        turns: result.turns,
        promptChars: text.length,
        memoryChars: ctxSizes.memoryChars,
        parentNotesChars: ctxSizes.parentNotesChars,
      },
    });

    const replyText = result.reply.trim() || (result.plan ? texts.planProposedFallback : "");
    const note = result.plan ? `\n\n${texts.planUpdatedNote}` : "";
    return {
      kind: "replied",
      plan: result.plan ? result.plan.summary : null,
      reply: replyText ? { role: "assistant", text: replyText + note } : null,
    };
  } catch (err) {
    if (err instanceof AgentAbortedError || options.signal?.aborted) {
      return { kind: "stopped", reply: { role: "assistant", text: texts.stopped } };
    }
    ports.telemetry.reportError({
      context: "game_plan",
      kidId: primaryKidId,
      gameId: input.gameId(),
      provider: execution?.provider,
      model: execution?.model,
      error: err,
      secrets: execution ? [execution.apiKey] : [],
      meta: { durationMs: now() - startedAt },
    });
    return { kind: "failed", reply: { role: "assistant", text: texts.planFailed } };
  }
}

// ----- Accepting a plan ---------------------------------------------------

export interface DerivePlanSettingsInput {
  /** The FINAL plan text (the parent may have rewritten dodi's proposal). */
  planText: string;
  kids: StudioKid[];
  primaryKidId: string | null;
  /** The parent's UI locale: the title and goal are written in it. */
  locale: string;
  /** Current form values, used when the model omits or garbles the range. */
  defaultAgeMin: number;
  defaultAgeMax: number;
  /** The game id as of now, for the usage report. */
  gameId: () => string | null;
}

/**
 * Derive the settings form from an accepted plan. Null when no game model
 * resolves (the parent fills the form themselves); throws when the
 * derivation itself fails.
 */
export async function derivePlanSettingsForStudio(
  ports: Pick<StudioEditorPorts, "execution" | "telemetry">,
  input: DerivePlanSettingsInput,
): Promise<PlanSettings | null> {
  const execution = await ports.execution.resolveGame();
  if (!execution) return null;
  const kid = input.kids.find((k) => k.id === input.primaryKidId);
  return derivePlanSettings(
    { providerId: execution.provider, modelId: execution.model, apiKey: execution.apiKey },
    input.planText,
    {
      kidAge: calculateChildAge(kid?.birthdate ?? null) ?? undefined,
      language: getLanguageDisplayName(input.locale),
      defaultAgeMin: input.defaultAgeMin,
      defaultAgeMax: input.defaultAgeMax,
    },
    (usage) =>
      ports.telemetry.reportUsage({
        eventType: "game_plan",
        kidId: input.primaryKidId,
        gameId: input.gameId(),
        provider: execution.provider,
        model: execution.model,
        usage,
      }),
  );
}

/** Fill the settings from a derived plan. A name the parent typed themselves wins. */
export function applyPlanSettings(game: StudioGame, settings: PlanSettings): StudioGame {
  return {
    ...game,
    title: game.title.trim() || settings.title,
    learningGoal: settings.learningGoal || game.learningGoal,
    successDefinition: settings.successDefinition || game.successDefinition,
    tags: settings.tags.length ? settings.tags : game.tags,
    targetAgeMin: settings.targetAgeMin,
    targetAgeMax: settings.targetAgeMax,
    perspective: settings.perspective,
  };
}

// ----- Persisting the Plan step -------------------------------------------

export interface PersistPlanningInput {
  /** The row, once the first planning write created it; null before. */
  gameId: string | null;
  game: StudioGame;
  /** The kid that would own a new row; null ⇒ nothing to attach it to. */
  kidId: string | null;
  planning: PlanningState;
  transcript: StudioChatMessage[];
}

export type PersistPlanningResult =
  /** The vault is locked, or there is no kid to own a new row: planning stays local. */
  | { kind: "skipped" }
  /** The existing row was patched; `row` is decrypted and already in the game cache. */
  | { kind: "updated"; row: Game }
  /** The first write created the row: the caller adopts `gameId` in place. */
  | { kind: "created"; gameId: string };

/**
 * Seal the Plan step (and the thread) onto the game row. The first write
 * creates the row: sealed placeholder bundle, inactive, minus the settings the
 * parent has not filled in yet. Later writes patch it; an accepted plan also
 * carries the settings derived from it, so a parent who leaves before saving
 * finds the form filled in on return. Throws with the server's reason.
 */
export async function persistPlanning(
  ports: Pick<StudioEditorPorts, "api" | "session" | "currentSession" | "games">,
  { gameId, game, kidId, planning, transcript }: PersistPlanningInput,
): Promise<PersistPlanningResult> {
  const session = ports.currentSession();
  if (!session) return { kind: "skipped" };
  const agentTranscriptEnc = sealTranscript(session, transcript);
  const planEnc = session.encryptJson(planning);

  if (gameId) {
    const derived = planning.isAccepted
      ? {
          ...encryptGameFields(await ports.session(), {
            title: game.title,
            learning_goal: game.learningGoal,
            success_definition: game.successDefinition,
          }),
          tags: game.tags,
          ...(isValidAgeRange(game.targetAgeMin, game.targetAgeMax)
            ? { target_age_min: game.targetAgeMin, target_age_max: game.targetAgeMax }
            : {}),
          metadata: { perspective: game.perspective },
        }
      : {};
    const res = await sendJson(ports.api, `/api/games/${gameId}`, "PATCH", {
      ...derived,
      agent_transcript_enc: agentTranscriptEnc,
      plan_enc: planEnc,
    });
    const row = decryptGame(await ports.session(), (await res.json()) as Game);
    ports.games.put(row);
    return { kind: "updated", row };
  }

  // Without a kid to own the row there is nothing to attach it to: planning
  // simply stays on the device.
  if (!kidId) return { kind: "skipped" };
  const sealed = encryptGameCreateFields(await ports.session(), {
    title: game.title.trim(),
    codeBundle: UNBUILT_GAME_PLACEHOLDER,
  });
  const res = await sendJson(ports.api, "/api/games", "POST", {
    kidId,
    ...sealed,
    targetAgeMin: game.targetAgeMin,
    targetAgeMax: game.targetAgeMax,
    isActive: false,
    audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
    ...(agentTranscriptEnc ? { agentTranscriptEnc } : {}),
    planEnc,
  });
  const data = (await res.json()) as { id: string };
  ports.games.invalidate();
  return { kind: "created", gameId: data.id };
}

/**
 * Serializes Plan-step writes: one at a time (so the create always lands
 * before the first patch), and again if anything changed while a write was in
 * flight. A failed write is handed to `onError` and the state stays on the
 * device; the next change tries again. The screen owns the debounce.
 */
export interface PlanningWriter {
  /** Something changed: the next flush writes it. */
  markDirty(): void;
  /** Drop a queued write (a settings save ends planning; nothing may resurrect the envelope). */
  discard(): void;
  isDirty(): boolean;
  /** Write while dirty. Returns at once when a write loop is already running. */
  flush(): Promise<void>;
  /** Resolves when the write loop in flight (if any) has finished. */
  settled(): Promise<void>;
}

export function createPlanningWriter(
  persist: () => Promise<void>,
  onError: (err: unknown) => void,
): PlanningWriter {
  let isDirty = false;
  let inflight: Promise<void> | null = null;
  return {
    markDirty: () => {
      isDirty = true;
    },
    discard: () => {
      isDirty = false;
    },
    isDirty: () => isDirty,
    flush: async () => {
      if (inflight) return;
      const run = (async () => {
        while (isDirty) {
          isDirty = false;
          try {
            await persist();
          } catch (err) {
            onError(err);
          }
        }
      })();
      inflight = run;
      try {
        await run;
      } finally {
        inflight = null;
      }
    },
    settled: async () => {
      await inflight;
    },
  };
}
