/**
 * Game Studio without a screen: the parent's side of the studio as plain,
 * stateless steps, for a client that is not a person at a screen (the dodi
 * CLI, driven by a family's own AI agent).
 *
 * Every step loads the game, its sealed thread and its Plan step from the row
 * and writes them back, exactly as a reopened studio would, so each step can
 * run in a fresh process and the parent later sees the whole conversation in
 * the app. The steps only compose the studio's existing parts (plan turns,
 * settings derivation and save, the build); there is no AI logic here.
 *
 *   planTurn      brainstorm with dodi (the first turn creates the game row)
 *   acceptPlan    derive the settings from the plan, save them, and return the
 *                 build that makes it (`isAgreedPlan`)
 *   prepareEdit   the build for a change request on a built game
 *   updateStudioSettings  the Settings tab: change a game's settings
 *
 * Builds themselves run through `createBuildManager` / `runStudioBuild`.
 */
import { decryptGame } from "@dodi/vault/game-crypto";
import type { Game } from "@dodi/types/database";
import type { GamePerspective } from "@dodi/types/games";
import type { VaultSession } from "@dodi/vault";
import { normalizeLocale } from "@dodi/intl";
import { loadMessages } from "@dodi/intl/messages";

import { isValidAgeRange } from "./age-range";
import type { AgentRunCheck } from "./agent-run-log";
import { SCREENSHOT_BOUND, type StudioBuildInput, type StudioBuildTexts, type StudioKid } from "./build-runner";
import { EMPTY_PLANNING, restorePlanning, type PlanningState } from "./plan-state";
import type { EditorGameCache, StudioPorts } from "./ports";
import { checkStudioProviders } from "./studio-editor";
import { emptyStudioGame, resolvePrimaryKidId, type StudioGame } from "./studio-game";
import { studioGameFromRow, type StudioGameSharing } from "./studio-load";
import {
  applyPlanSettings,
  derivePlanSettingsForStudio,
  persistPlanning,
  runPlanTurn,
  type PlanTurnOptions,
  type PlanTurnTexts,
} from "./studio-plan";
import { mapSettingsSuccessDefinition, patchGameSettings } from "./studio-settings";
import { restoreTranscript, type StudioChatMessage } from "./transcript";

/** A build client's ports plus what the editor steps need (sealing while unlocked, list invalidation). */
export interface StudioSessionPorts extends Omit<StudioPorts, "games"> {
  currentSession(): VaultSession | null;
  games: EditorGameCache;
}

export interface StudioSessionTexts {
  build: StudioBuildTexts;
  plan: PlanTurnTexts;
  /** Heads the build message that turns an accepted plan into a game. */
  planBuildIntro: string;
}

/** Who the studio works for: the family's kids (decrypted) and the parent's UI language. */
export interface StudioSessionContext {
  kids: StudioKid[];
  /** The parent's UI locale: replies, settings and narration are written in it. */
  locale: string;
  texts: StudioSessionTexts;
}

/** The studio's replies in the parent's language, from the shared message catalogs. */
export async function loadStudioSessionTexts(locale: string): Promise<StudioSessionTexts> {
  const t = (await loadMessages(normalizeLocale(locale))).gameStudio;
  return {
    build: {
      buildSummaryTitle: t.buildSummaryTitle,
      stopped: t.stopped,
      paused: t.buildPaused,
      buildFailed: t.buildFailed,
      aiUnavailable: t.aiUnavailable,
      previewUpdated: t.previewUpdatedMessage,
      previewUpdateFailed: t.previewUpdateFailedMessage,
    },
    plan: {
      planProposedFallback: t.planProposedFallback,
      planUpdatedNote: t.planUpdatedNote,
      stopped: t.stopped,
      planFailed: t.planFailed,
      aiUnavailable: t.aiUnavailable,
    },
    planBuildIntro: t.planBuildIntro,
  };
}

/** A game as the studio left it: the editor's game, the thread and (while planning) the Plan step. */
export interface StudioSnapshot {
  game: StudioGame;
  transcript: StudioChatMessage[];
  /** Non-null while the game is still on the Plan step. */
  planning: PlanningState | null;
}

export class StudioSessionError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "no_kids"
      | "still_planning"
      | "not_planning"
      | "no_plan"
      | "vault_locked"
      | "invalid_settings"
      | "no_image_provider",
    /** For invalid_settings: the fields that were refused. */
    readonly fields: string[] = [],
  ) {
    super(code);
    this.name = "StudioSessionError";
  }
}

/** Load a game the way the studio reopens it. */
export async function openStudioGame(
  ports: Pick<StudioSessionPorts, "api" | "session">,
  gameId: string,
): Promise<StudioSnapshot> {
  const [gameRes, sharingRes] = await Promise.all([
    ports.api.request(`/api/games/${encodeURIComponent(gameId)}`),
    ports.api.request(`/api/games/${encodeURIComponent(gameId)}/sharing`),
  ]);
  if (!gameRes.ok) throw new StudioSessionError("not_found");
  const session = await ports.session();
  const row = decryptGame(session, (await gameRes.json()) as Game);
  const sharing = sharingRes.ok ? normalizeSharing(await sharingRes.json()) : { family: false, kidIds: [] };
  const game = studioGameFromRow(row, sharing);
  return {
    game,
    transcript: restoreTranscript(session, row.agent_transcript_enc),
    planning: restorePlanning(row.plan_enc, session),
  };
}

/** `GET /api/games/{id}/sharing`, read defensively. */
function normalizeSharing(value: unknown): StudioGameSharing {
  const raw = value as Partial<StudioGameSharing> | null;
  return {
    family: Boolean(raw?.family),
    kidIds: Array.isArray(raw?.kidIds) ? raw.kidIds.filter((id): id is string => typeof id === "string") : [],
  };
}

// ----- Plan step ------------------------------------------------------------

export interface PlanTurnStepInput {
  /** The game being planned; null starts a new one (the first turn creates its row). */
  gameId: string | null;
  text: string;
  images?: string[];
  /** A new game for one kid instead of the whole family. */
  kidId?: string | null;
}

export interface PlanTurnStepResult {
  kind: "replied" | "stopped" | "failed" | "no_provider";
  /** The row (created by this turn for a new game); null when nothing could be persisted. */
  gameId: string | null;
  /** dodi's reply in the thread. */
  reply: StudioChatMessage | null;
  /** The plan on the table after this turn (dodi's latest proposal), "" when none yet. */
  plan: string;
}

/** One brainstorming turn with dodi, persisted onto the game row like the studio does. */
export async function planTurn(
  ports: StudioSessionPorts,
  ctx: StudioSessionContext,
  input: PlanTurnStepInput,
  options: PlanTurnOptions = {},
): Promise<PlanTurnStepResult> {
  if (ctx.kids.length === 0) throw new StudioSessionError("no_kids");
  const snapshot = input.gameId ? await openStudioGame(ports, input.gameId) : null;
  if (snapshot && !snapshot.planning) throw new StudioSessionError("not_planning");

  const game: StudioGame = snapshot?.game ?? {
    ...emptyStudioGame(),
    ...(input.kidId ? { isFamily: false, audienceIds: [input.kidId] } : {}),
  };
  const planning = snapshot?.planning ?? EMPTY_PLANNING;
  const history = snapshot?.transcript ?? [];
  const primaryKidId = resolvePrimaryKidId(game, ctx.kids);
  const images = input.images ?? [];
  let gameId = input.gameId;

  const outcome = await runPlanTurn(
    ports,
    {
      text: input.text,
      attachments: images,
      history,
      currentPlan: planning.summary || null,
      kids: ctx.kids,
      primaryKidId,
      replyLocale: ctx.locale,
      gameId: () => gameId,
      texts: ctx.texts.plan,
    },
    options,
  );
  if (outcome.kind === "no_provider") {
    return { kind: "no_provider", gameId, reply: null, plan: planning.summary };
  }

  const userTurn: StudioChatMessage = { role: "user", text: input.text, ...(images.length ? { images } : {}) };
  const reply = outcome.reply;
  const transcript = reply ? [...history, userTurn, reply] : [...history, userTurn];
  const nextPlanning: PlanningState =
    outcome.kind === "replied" && outcome.plan !== null ? { ...planning, summary: outcome.plan } : planning;

  const persisted = await persistPlanning(ports, {
    gameId,
    game,
    kidId: primaryKidId,
    planning: nextPlanning,
    transcript,
  });
  if (persisted.kind === "created") gameId = persisted.gameId;
  return { kind: outcome.kind, gameId, reply, plan: nextPlanning.summary };
}

// ----- Accepting the plan -----------------------------------------------------

export interface AcceptPlanInput {
  gameId: string;
  /** The plan to build, if it differs from dodi's last proposal. */
  planText?: string;
}

/**
 * Accept the plan: derive the settings from it (title, learning goal, success
 * definition, ages, perspective), switch the background and preview pictures
 * on when an image model is set up (the studio's default for new games), save
 * them (which ends planning) and return the build that makes the game.
 */
export async function acceptPlan(
  ports: StudioSessionPorts,
  ctx: StudioSessionContext,
  input: AcceptPlanInput,
): Promise<StudioBuildInput> {
  const snapshot = await openStudioGame(ports, input.gameId);
  if (!snapshot.planning) throw new StudioSessionError("not_planning");
  const planText = (input.planText ?? snapshot.planning.summary).trim();
  if (!planText) throw new StudioSessionError("no_plan");

  let game = snapshot.game;
  const primaryKidId = resolvePrimaryKidId(game, ctx.kids);
  try {
    const settings = await derivePlanSettingsForStudio(ports, {
      planText,
      kids: ctx.kids,
      primaryKidId,
      locale: ctx.locale,
      defaultAgeMin: game.targetAgeMin,
      defaultAgeMax: game.targetAgeMax,
      gameId: () => input.gameId,
    });
    if (settings) game = applyPlanSettings(game, settings);
  } catch {
    // As in the studio: a failed derivation leaves the settings as they were.
  }
  if (!game.title.trim()) game = { ...game, title: fallbackTitle(planText) };

  const providers = await checkStudioProviders(ports);
  game = {
    ...game,
    generateBackgroundImage: providers.hasImageProvider,
    generatePreviewImage: providers.hasImageProvider,
  };

  // The build start skips the success mapping: the first build maps it itself.
  const row = await patchGameSettings(ports, input.gameId, game, { mapped: null, isEndingPlanning: true });
  game = studioGameFromRow(row, { family: game.isFamily, kidIds: game.audienceIds });

  return buildInput(ctx, {
    gameId: input.gameId,
    game,
    text: `${ctx.texts.planBuildIntro}\n\n${planText}`,
    images: [],
    history: snapshot.transcript,
    isAgreedPlan: true,
  });
}

/** A title when the derivation gave none: the plan's first line, bounded. */
function fallbackTitle(planText: string): string {
  const first = planText.split("\n").find((line) => line.trim()) ?? "";
  return first.replace(/^[#*\-\s]+/, "").slice(0, 60).trim() || "New game";
}

// ----- Settings --------------------------------------------------------------------

/** The settings a parent edits on the studio's Settings tab; omitted fields stay as they are. */
export interface StudioSettingsChanges {
  title?: string;
  learningGoal?: string;
  successDefinition?: string;
  targetAgeMin?: number;
  targetAgeMax?: number;
  /** null = dodi chooses. */
  perspective?: GamePerspective | null;
  generateBackgroundImage?: boolean;
  generatePreviewImage?: boolean;
}

export interface StudioSettingsResult {
  game: StudioGame;
  /**
   * The success definition (or the learning goal it is read against) changed
   * and was mapped to criteria again; "failed" kept the stored criteria.
   */
  successMapping: "unchanged" | "mapped" | "failed";
}

/**
 * Save changed settings of a game that is past planning, as the studio's
 * Settings tab does: the success definition is mapped to criteria again when
 * it (or the learning goal) changed, and the pictures can only be switched on
 * with an image model set up. Takes effect from the next build: switching the
 * preview picture on for a game without one makes that build draw it.
 */
export async function updateStudioSettings(
  ports: StudioSessionPorts,
  gameId: string,
  changes: StudioSettingsChanges,
): Promise<StudioSettingsResult> {
  const snapshot = await openStudioGame(ports, gameId);
  // While planning, the settings come from the plan when it is built.
  if (snapshot.planning) throw new StudioSessionError("still_planning");

  const defined = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as StudioSettingsChanges;
  const game: StudioGame = { ...snapshot.game, ...defined };
  const invalid = [
    defined.title !== undefined && !game.title.trim() ? "title" : null,
    defined.learningGoal !== undefined && !game.learningGoal.trim() ? "learningGoal" : null,
    (defined.targetAgeMin !== undefined || defined.targetAgeMax !== undefined) &&
    !isValidAgeRange(game.targetAgeMin, game.targetAgeMax)
      ? "ages"
      : null,
  ].filter((field): field is string => field !== null);
  if (invalid.length) throw new StudioSessionError("invalid_settings", invalid);

  if (defined.generateBackgroundImage || defined.generatePreviewImage) {
    const { hasImageProvider } = await checkStudioProviders(ports);
    if (!hasImageProvider) throw new StudioSessionError("no_image_provider");
  }

  const isMappingNeeded =
    (defined.successDefinition !== undefined && defined.successDefinition !== snapshot.game.successDefinition) ||
    (defined.learningGoal !== undefined && defined.learningGoal !== snapshot.game.learningGoal);
  const mapped = isMappingNeeded ? await mapSettingsSuccessDefinition(ports, game) : null;

  const row = await patchGameSettings(ports, gameId, game, { mapped, isEndingPlanning: false });
  return {
    game: studioGameFromRow(row, { family: game.isFamily, kidIds: game.audienceIds }),
    successMapping: !isMappingNeeded ? "unchanged" : mapped ? "mapped" : "failed",
  };
}

// ----- Edit rounds -----------------------------------------------------------------

export interface PrepareEditInput {
  gameId: string;
  text: string;
  images?: string[];
}

/**
 * The build for a change request on a game that is past planning. Edits of a
 * built game carry a fresh screenshot of how it looks now (the studio's live
 * snapshot), when a screenshot service is available.
 */
export async function prepareEdit(
  ports: StudioSessionPorts,
  ctx: StudioSessionContext,
  input: PrepareEditInput,
): Promise<StudioBuildInput> {
  const snapshot = await openStudioGame(ports, input.gameId);
  if (snapshot.planning) throw new StudioSessionError("still_planning");
  const screenshot = snapshot.game.built ? await captureGame(ports, snapshot.game.codeBundle) : undefined;
  return buildInput(ctx, {
    gameId: input.gameId,
    game: snapshot.game,
    text: input.text,
    images: input.images ?? [],
    history: snapshot.transcript,
    ...(screenshot ? { screenshot } : {}),
  });
}

/** The opening screen of the game as it is now, bounded like the studio's edit screenshot. */
export async function captureGame(
  ports: Pick<StudioSessionPorts, "screenshots" | "images">,
  code: string,
): Promise<string | undefined> {
  const renderer = ports.screenshots.forBuild();
  if (!renderer) return undefined;
  const output = await renderer.viewGame({ code, steps: [] }).catch(() => null);
  const frame = output?.frames[0]?.image;
  if (!frame) return undefined;
  return (await ports.images.downscale(frame, SCREENSHOT_BOUND)) ?? undefined;
}

function buildInput(
  ctx: StudioSessionContext,
  input: Pick<StudioBuildInput, "gameId" | "game" | "text" | "images" | "history" | "isAgreedPlan" | "screenshot">,
): StudioBuildInput {
  const primaryKidId = resolvePrimaryKidId(input.game as StudioGame, ctx.kids);
  if (!primaryKidId) throw new StudioSessionError("no_kids");
  return {
    ...input,
    kids: ctx.kids,
    primaryKidId,
    narrationLocale: ctx.locale,
    texts: ctx.texts.build,
  };
}

// ----- Reading a finished build ---------------------------------------------------------

/** The screenshot checks the game agent ran during the last build (frames included). */
export function lastBuildChecks(transcript: StudioChatMessage[]): AgentRunCheck[] {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const message = transcript[i];
    if (message.role === "user") return [];
    if (message.run) {
      return message.run.entries.filter((entry): entry is AgentRunCheck => entry.kind === "check");
    }
  }
  return [];
}

/** dodi's last reply in the thread. */
export function lastReply(transcript: StudioChatMessage[]): StudioChatMessage | null {
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].role === "assistant") return transcript[i];
    if (transcript[i].role === "user") return null;
  }
  return null;
}
