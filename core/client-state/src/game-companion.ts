/**
 * The companion's side of a game play: what happens when dodi (a voice tool
 * call, a text-assistant command marker) or the game itself asks the host for
 * something the sandbox can't do on its own. Shared by web and mobile; each
 * play view creates one per mounted play and keeps it current.
 *
 *   - `generate_drawing`: a coloring sheet from the image provider, pushed in
 *     as `set_generated_image`.
 *   - `generate_text`: one coherent fill of the game's declared content slots
 *     from the thinking provider, pushed in as `set_generated_text`. Also
 *     game-requested (rate-limited, the requesting code is untrusted).
 *   - `generate_voice`: the game asks dodi to read a short text aloud through
 *     the live voice session (rate-limited, capped).
 *   - `save_snapshot` / `share_snapshot`: the play session's snapshot flows.
 *
 * Every provider call runs on the device with the vault-held key (BYOK
 * provider blindness). A held-open voice tool call is released through the
 * session's `resolveClientCommand` once the work landed or failed, so dodi
 * speaks exactly one completion line.
 */
import { createClientImageProvider } from "@dodi/ai/image-providers/factory";
import { buildDrawingPrompt } from "@dodi/ai/image-providers/coloring-prompt";
import { createClientThinkingProvider } from "@dodi/ai/client-thinking";
import { buildGameContentPrompt, parseContentSlots, parseGeneratedSlots, type ContentSlot } from "@dodi/ai/game-content";
import { calculateChildAge, getLanguageDisplayName } from "@dodi/ai/dodi-context";
import { gameDebug, gameDebugWarn } from "@dodi/games/debug";
import { STAGE } from "@dodi/games/stage";
import type { DrawingStyle, GameCommand } from "@dodi/types/games";

import type { CompanionActivity, CompanionContext } from "./companion-session";
import type { GamePlayInfo, ShareSnapshotOutcome } from "./game-play";
import type { KidStore } from "./kid-store";
import { type ExecutionResolver, NoThinkingModelError } from "./resolve-execution";
import type { Telemetry } from "./telemetry";

export { NoThinkingModelError };

/**
 * Caps for game-initiated text generation (game:event "request_generate_text").
 * The requesting code is sealed, AI-generated game code: treat it as untrusted
 * and never let it spend AI tokens unbounded. Dodi-initiated calls are gated by
 * the conversation itself and bypass these.
 */
export const GAME_TEXT_REQUEST_MAX_PER_PLAY = 20;
export const GAME_TEXT_REQUEST_COOLDOWN_MS = 5000;
/**
 * Caps for game-initiated voice requests (game:event "request_generate_voice").
 * Same rationale as the text caps. Each request occupies the live voice session
 * for one spoken line, so the cooldown roughly matches how long dodi takes to
 * say one. Only requests that actually reach the session count against the cap.
 */
export const GAME_VOICE_REQUEST_MAX_PER_PLAY = 30;
export const GAME_VOICE_REQUEST_COOLDOWN_MS = 4000;
/** Longest text a game may have dodi read aloud in one request. */
export const GAME_VOICE_TEXT_MAX_CHARS = 400;

// ---------------------------------------------------------------------------
// Generators (device-side provider calls)
// ---------------------------------------------------------------------------

export class NoImageModelError extends Error {
  constructor() {
    super("No image model configured");
    this.name = "NoImageModelError";
  }
}

export interface GenerateGameTextParams {
  kidId: string;
  /** null for snapshot sessions: usage rows FK `games`. */
  gameId: string | null;
  /** Dodi's request: topic, difficulty, the child's wishes. */
  request: string;
  /** The game's currently declared content slots (already parsed/capped). */
  slots: ContentSlot[];
  gameTitle: string;
  gameDescription?: string;
}

export interface GameGenerators {
  /**
   * A coloring-sheet outline of `subject` in `style` (a plain 2D picture or a
   * mandala) as a `data:` URL. Throws {@link NoImageModelError} when no image
   * model is set up.
   */
  generateDrawing(subject: string, style?: DrawingStyle): Promise<string>;
  /**
   * Text for every declared slot in one coherent generation, as the validated
   * `{ slotId: text }` map. Throws {@link NoThinkingModelError} when no
   * thinking model is set up; rethrows provider/validation failures.
   */
  generateText(params: GenerateGameTextParams): Promise<Record<string, string>>;
}

export interface GameGeneratorDeps {
  kids: KidStore;
  execution: Pick<ExecutionResolver, "resolveImage" | "resolveThinking">;
  reportUsage: Telemetry["reportUsage"];
}

/** The in-game generators over the app's stores (keys resolved from the vault). */
export function createGameGenerators(deps: GameGeneratorDeps): GameGenerators {
  return {
    async generateDrawing(subject, style = "picture") {
      const image = await deps.execution.resolveImage();
      if (!image) throw new NoImageModelError();
      const provider = createClientImageProvider(image.provider, image.apiKey, image.model);
      const { dataUrl } = await provider.generateImage(buildDrawingPrompt(subject, style), {
        aspectRatio: `${STAGE.aspectW}:${STAGE.aspectH}`,
      });
      return dataUrl;
    },

    async generateText(params) {
      const kid = await deps.kids.getState().loadOne(params.kidId);
      if (!kid) throw new Error("Kid not found");

      const thinking = await deps.execution.resolveThinking();
      if (!thinking) throw new NoThinkingModelError();

      const provider = createClientThinkingProvider(thinking.provider, thinking.apiKey, thinking.model, (usage) =>
        deps.reportUsage({
          eventType: "game_text_generation",
          kidId: params.kidId,
          gameId: params.gameId,
          provider: thinking.provider,
          model: thinking.model,
          usage,
          meta: { promptChars: params.request.length },
        }),
      );

      const { system, prompt } = buildGameContentPrompt({
        request: params.request,
        slots: params.slots,
        gameTitle: params.gameTitle,
        gameDescription: params.gameDescription,
        childAge: calculateChildAge(kid.birthdate),
        languageName: getLanguageDisplayName(kid.language),
      });

      const raw = await provider.generateJson(system, prompt);
      return parseGeneratedSlots(raw, params.slots);
    },
  };
}

// ---------------------------------------------------------------------------
// The play's companion controller
// ---------------------------------------------------------------------------

/** The slice of the companion session a play uses. */
export interface GameCompanionSessionState {
  context: CompanionContext;
  beginAiActivity(kind: CompanionActivity): void;
  endAiActivity(kind: CompanionActivity): void;
  resolveClientCommand(result: { ok: boolean; message?: string; error?: string }): void;
  speakGameVoiceText(text: string): { ok: true } | { ok: false; error: "voice_unavailable" };
}

/** The mounted sandbox, as far as the companion talks to it. */
export interface GameCompanionSandbox {
  sendCommand(command: GameCommand): void;
}

/** The kid-facing failure texts (translated by the view). */
export interface GameCompanionMessages {
  noImageModel(): string;
  drawingFailed(): string;
  noThinkingModel(): string;
  textGenerationFailed(): string;
  snapshotSaveFailed(): string;
  snapshotShareFailed(): string;
  sandboxNotReady(): string;
}

/** The play view around the companion. */
export interface GameCompanionHost {
  /** The mounted sandbox, null before mount / between resets. */
  sandbox(): GameCompanionSandbox | null;
  /** The play session's snapshot save (the view adds its flash). */
  saveSnapshot(requestedTitle?: string): Promise<{ title: string }>;
  /** The play session's snapshot share (the view adds its flash). */
  shareSnapshot(friendName: string, requestedTitle?: string): Promise<ShareSnapshotOutcome>;
  /** The error banner: a failure text, or null to clear it. */
  onGameError(error: string | null): void;
  messages: GameCompanionMessages;
}

export interface GameCompanionDeps {
  /** The companion voice session (its vanilla store satisfies this). */
  session: { getState(): GameCompanionSessionState };
  generators: GameGenerators;
}

export interface GameCompanion {
  /** The view's current props (read on every use). */
  update(info: GamePlayInfo): void;
  /** The view's handlers (sandbox access, snapshot flows, error banner, texts). */
  setHost(host: GameCompanionHost): void;
  /**
   * Commands from dodi (voice tool calls, text-assistant markers): host-handled
   * meta-commands run here, everything else goes to the sandbox.
   */
  runCommands(commands: GameCommand[]): void;
  /** The game asked for generated text (game:event "request_generate_text"). */
  handleGameTextRequest(request: string | undefined): void;
  /** The game asked dodi to read a text aloud (game:event "request_generate_voice"). */
  handleGameVoiceRequest(text: string | undefined): void;
  /**
   * Save a snapshot with dodi's "thinking" state and the held-open voice call
   * released (the `save_snapshot` meta-command; also the photo button, where
   * no call is pending and the release no-ops). Never rejects.
   */
  saveSnapshot(command?: GameCommand): Promise<void>;
}

const DETACHED_MESSAGES: GameCompanionMessages = {
  noImageModel: () => "",
  drawingFailed: () => "",
  noThinkingModel: () => "",
  textGenerationFailed: () => "",
  snapshotSaveFailed: () => "",
  snapshotShareFailed: () => "",
  sandboxNotReady: () => "",
};

const DETACHED_HOST: GameCompanionHost = {
  sandbox: () => null,
  saveSnapshot: () => Promise.reject(new Error("not_attached")),
  shareSnapshot: () => Promise.reject(new Error("not_attached")),
  onGameError: () => {},
  messages: DETACHED_MESSAGES,
};

/** One per mounted play view; `update` + `setHost` keep it on the view's current state. */
export function createGameCompanion(
  deps: GameCompanionDeps,
  initialInfo: GamePlayInfo,
  now: () => number = () => Date.now(),
): GameCompanion {
  let info = initialInfo;
  let host = DETACHED_HOST;
  const session = (): GameCompanionSessionState => deps.session.getState();

  let isTextGenerationBusy = false;
  let gameTextRequestCount = 0;
  let lastGameTextRequestAt = -Infinity;
  let gameVoiceRequestCount = 0;
  let lastGameVoiceRequestAt = -Infinity;

  const isSnapshotSession = (): boolean => !!info.snapshot;

  async function handleGenerateDrawing(command: GameCommand): Promise<void> {
    const subject = typeof command.payload?.subject === "string" ? command.payload.subject : "";
    host.onGameError(null);
    session().beginAiActivity("image");
    try {
      const dataUrl = await deps.generators.generateDrawing(subject, info.drawingStyle);
      host.sandbox()?.sendCommand({ type: "set_generated_image", payload: { dataUrl } });
      // Picture is on the canvas → release the held-open voice tool call so dodi
      // announces it (it stayed silent while it generated). No-op if the drawing
      // wasn't triggered by a voice tool call.
      session().resolveClientCommand({ ok: true });
    } catch (error) {
      gameDebugWarn("playview", "generate_drawing failed:", error);
      const message =
        error instanceof NoImageModelError ? host.messages.noImageModel() : host.messages.drawingFailed();
      host.onGameError(message);
      session().resolveClientCommand({ ok: false, error: message });
    } finally {
      session().endAiActivity("image");
    }
  }

  function deliverTextFailure(error: string): void {
    host.sandbox()?.sendCommand({ type: "set_generated_text", payload: { slots: {}, error } });
  }

  async function handleGenerateText(command: GameCommand, isGameRequested: boolean): Promise<void> {
    if (isTextGenerationBusy) {
      // One generation at a time: the in-flight result lands shortly.
      if (isGameRequested) return;
      session().resolveClientCommand({
        ok: false,
        error:
          "New text is already being written for this game. In one short sentence, ask the child to wait a moment.",
      });
      return;
    }
    if (isGameRequested) {
      const at = now();
      if (
        gameTextRequestCount >= GAME_TEXT_REQUEST_MAX_PER_PLAY ||
        at - lastGameTextRequestAt < GAME_TEXT_REQUEST_COOLDOWN_MS
      ) {
        gameDebugWarn("playview", "request_generate_text denied (rate limit)");
        deliverTextFailure("rate_limited");
        return;
      }
      gameTextRequestCount += 1;
      lastGameTextRequestAt = at;
    }

    const request = typeof command.payload?.request === "string" ? command.payload.request : "";
    const ctx = session().context;
    const slots = ctx.type === "game" ? parseContentSlots(ctx.gameState) : [];
    if (slots.length === 0) {
      // Not an app failure: the game declares no fillable slots right now.
      if (isGameRequested) {
        deliverTextFailure("no_slots");
        return;
      }
      session().resolveClientCommand({
        ok: false,
        error:
          "This game has no text slots to fill right now, so no text was written. " +
          "In one short sentence, gently tell the child this game cannot take new text at the moment.",
      });
      return;
    }

    host.onGameError(null);
    isTextGenerationBusy = true;
    session().beginAiActivity("writing");
    try {
      const generated = await deps.generators.generateText({
        kidId: info.kidId,
        gameId: isSnapshotSession() ? null : info.gameId,
        request,
        slots,
        gameTitle: info.inlineContext?.title ?? info.title,
        gameDescription: info.inlineContext?.description ?? info.description,
      });
      host.sandbox()?.sendCommand({ type: "set_generated_text", payload: { slots: generated } });
      // Content is in the game → release the held-open voice tool call so dodi
      // announces it. Game-requested runs skip this: it must never resolve an
      // unrelated pending voice call.
      if (!isGameRequested) {
        session().resolveClientCommand({
          ok: true,
          message:
            "The new text is now in the game. In ONE short, cheerful sentence, tell the child it is ready — do not repeat yourself.",
        });
      }
    } catch (error) {
      gameDebugWarn("playview", "generate_text failed:", error);
      const isMissingModel = error instanceof NoThinkingModelError;
      const message = isMissingModel ? host.messages.noThinkingModel() : host.messages.textGenerationFailed();
      host.onGameError(message);
      if (isGameRequested) {
        deliverTextFailure(isMissingModel ? "no_thinking_model" : "generation_failed");
      } else {
        session().resolveClientCommand({ ok: false, error: message });
      }
    } finally {
      isTextGenerationBusy = false;
      session().endAiActivity("writing");
    }
  }

  // The game always receives a `set_generated_voice` result: { ok: true } when
  // dodi is about to speak, or { ok: false, error } (rate_limited, empty_text,
  // voice_unavailable) so its speaking indicator can recover. Deaf does NOT
  // block this (dodi can still be heard while its mic is off); only a full
  // mute, sleep, or a dead session is unavailable.
  function handleGenerateVoice(command: GameCommand): void {
    const deliver = (payload: { ok: boolean; error?: string }): void => {
      host.sandbox()?.sendCommand({ type: "set_generated_voice", payload });
    };

    const text = typeof command.payload?.text === "string" ? command.payload.text.trim() : "";
    if (!text) {
      deliver({ ok: false, error: "empty_text" });
      return;
    }
    const at = now();
    if (
      gameVoiceRequestCount >= GAME_VOICE_REQUEST_MAX_PER_PLAY ||
      at - lastGameVoiceRequestAt < GAME_VOICE_REQUEST_COOLDOWN_MS
    ) {
      gameDebugWarn("playview", "request_generate_voice denied (rate limit)");
      deliver({ ok: false, error: "rate_limited" });
      return;
    }

    const result = session().speakGameVoiceText(text.slice(0, GAME_VOICE_TEXT_MAX_CHARS));
    if (!result.ok) {
      // Not an app failure: dodi is muted, asleep, or disconnected. The game
      // must stay playable without voice, so no error banner.
      deliver({ ok: false, error: result.error });
      return;
    }
    gameVoiceRequestCount += 1;
    lastGameVoiceRequestAt = at;
    deliver({ ok: true });
  }

  async function handleSaveSnapshot(command: GameCommand = { type: "save_snapshot" }): Promise<void> {
    host.onGameError(null);
    session().beginAiActivity("thinking");
    try {
      const requestedTitle = typeof command.payload?.title === "string" ? command.payload.title : undefined;
      const { title } = await host.saveSnapshot(requestedTitle);
      session().resolveClientCommand({
        ok: true,
        message: `The snapshot "${title}" is saved. In ONE short, cheerful sentence, tell the child it's saved in their snapshot collection — do not repeat yourself.`,
      });
    } catch (error) {
      gameDebugWarn("playview", "save_snapshot failed:", error);
      host.onGameError(host.messages.snapshotSaveFailed());
      session().resolveClientCommand({
        ok: false,
        error: "Saving the snapshot didn't work this time. In one short sentence, gently tell the child.",
      });
    } finally {
      session().endAiActivity("thinking");
    }
  }

  async function handleShareSnapshot(command: GameCommand): Promise<void> {
    host.onGameError(null);
    session().beginAiActivity("thinking");
    try {
      const friendName = typeof command.payload?.friend_name === "string" ? command.payload.friend_name : "";
      const requestedTitle = typeof command.payload?.title === "string" ? command.payload.title : undefined;
      // Share implies save: own copy marked with the recipient + a copy sealed
      // to the friend's keys (in the play session).
      const outcome = await host.shareSnapshot(friendName, requestedTitle);
      if (outcome.kind !== "ok") {
        const candidates = outcome.candidates.join(", ") || "none";
        session().resolveClientCommand({
          ok: false,
          error:
            outcome.kind === "ambiguous"
              ? `More than one friend matches "${friendName}" (${candidates}). In one short sentence, ask the child which friend they mean.`
              : `No friend named "${friendName}" was found. The child's friends are: ${candidates}. In one short sentence, ask the child which friend they mean.`,
        });
        return;
      }
      session().resolveClientCommand({
        ok: true,
        message: `The snapshot "${outcome.title}" was sent to ${outcome.displayName} and saved in the child's own collection. In ONE short, cheerful sentence, tell the child — do not repeat yourself.`,
      });
    } catch (error) {
      gameDebugWarn("playview", "share_snapshot failed:", error);
      host.onGameError(host.messages.snapshotShareFailed());
      session().resolveClientCommand({
        ok: false,
        error: "Sharing the snapshot didn't work this time. In one short sentence, gently tell the child.",
      });
    } finally {
      session().endAiActivity("thinking");
    }
  }

  return {
    update(next) {
      info = next;
    },

    setHost(next) {
      host = next;
    },

    runCommands(commands) {
      gameDebug("playview", `runCommands called with ${commands.length} commands`);
      if (commands.length === 0) return;

      const sandbox = host.sandbox();
      if (!sandbox) {
        gameDebugWarn("playview", "Sandbox ref is null — cannot send commands");
        host.onGameError(host.messages.sandboxNotReady());
        return;
      }

      for (const command of commands) {
        switch (command.type) {
          case "generate_drawing":
            void handleGenerateDrawing(command);
            break;
          case "generate_text":
            void handleGenerateText(command, false);
            break;
          case "generate_voice":
            // Never a voice tool, but a marker-emitted command from the text
            // assistant could still name it: handled host-side, the sandbox
            // doesn't implement it.
            handleGenerateVoice(command);
            break;
          case "save_snapshot":
            void handleSaveSnapshot(command);
            break;
          case "share_snapshot":
            void handleShareSnapshot(command);
            break;
          default:
            gameDebug("playview", "Sending command to sandbox:", command);
            sandbox.sendCommand(command);
        }
      }
    },

    handleGameTextRequest(request) {
      void handleGenerateText(
        { type: "generate_text", payload: typeof request === "string" ? { request } : {} },
        true,
      );
    },

    handleGameVoiceRequest(text) {
      handleGenerateVoice({ type: "generate_voice", payload: typeof text === "string" ? { text } : {} });
    },

    saveSnapshot: handleSaveSnapshot,
  };
}
