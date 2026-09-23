"use client";

import { dodi } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { GameStage } from "@/components/games/game-stage";
import type { GameSandboxHandle } from "@/components/games/game-sandbox";
import { RequiredMark } from "@/components/parent/rows";
import { Icon, type IconName } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STAGE } from "@/lib/games/stage";
import { GAME_TAGS } from "@dodi/games/tags";
import { sanitizeGameBundle } from "@dodi/games/sanitizer";
import { hasTranslationsBlock } from "@dodi/games/translations";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";
import { injectBackgroundImage } from "@dodi/games/background-image";
import { normalizeLocale } from "@dodi/intl/locales";
import { locales } from "@/i18n/config";
import { tagStyle } from "@/components/parent/games/tag-style";
import { CodeViewer } from "@/components/parent/games/code-viewer";
import { AgeRange, isValidAgeRange } from "@/components/parent/games/age-range";
import { PlanActionRow, PlanEmptyActions } from "@/components/parent/games/plan-chat-actions";
import { PlanSketchSurface } from "@/components/parent/games/plan-sketch-surface";
import {
  type DraftView,
  EMPTY_PLANNING,
  type PlanningState,
  resolveInitialView,
  restorePlanning,
} from "@/components/parent/games/plan-state";
import { PlanSurface } from "@/components/parent/games/plan-surface";
import { ReferenceImageSheet } from "@/components/parent/games/reference-image-sheet";
import type { SketchStroke } from "@/components/parent/games/sketch-strokes";
import {
  resolveStudioPanes,
  type PlanSurface as PlanSurfaceKind,
} from "@/components/parent/games/studio-panes";
import { RichText } from "@/components/parent/games/rich-text";
import { AgentRunHistory } from "@/components/parent/games/agent-run-history";
import { AgentRunTimeline } from "@/components/parent/games/agent-run-timeline";
import {
  type AgentRunLog,
  type AgentRunOutcome,
  boundRunLogs,
  restoreRunLog,
} from "@/lib/games/agent-run-log";
import { createAgentRunRecorder, RUN_FRAME_BOUND } from "@/lib/games/agent-run-recorder";
import { useTagLabel } from "@/lib/games/tag-label";
import { cn } from "@/lib/utils";
import {
  capImages,
  downscaleDataUrl,
  fileToDataUrl,
  squareThumbnailDataUrl,
} from "@/lib/games/thumbnail";
import { gameDebugWarn } from "@dodi/games/debug";
import { useKids } from "@/hooks/use-kids";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";
import {
  decryptGameResponse,
  decryptVersionResponse,
  sealGameCreateFields,
  sealGameFields,
  useGameStore,
} from "@/stores/game-store";
import { gameScreenshotServiceOf, useAccountStore } from "@/stores/account-store";
import { useVaultStore } from "@/stores/vault-store";
import {
  captureGameFrames,
  isDodiScreenshotServiceUnavailable,
  type ScreenshotTarget,
} from "@/lib/games/screenshot-service";
import { resolveClientGame } from "@/lib/ai/resolve-client-game";
import { resolveClientImage } from "@/lib/ai/resolve-client-image";
import { createClientImageProvider } from "@dodi/ai/image-providers/factory";
import { buildBackgroundPrompt } from "@dodi/ai/image-providers/background-prompt";
import { buildPreviewPrompt } from "@dodi/ai/image-providers/preview-prompt";
import { calculateChildAge, getLanguageDisplayName } from "@dodi/ai/dodi-context";
import { buildLearningContext, measureLearningContext } from "@dodi/ai/learning-context";
import { runGameAgent, AgentAbortedError, GameAgentError, type PriorTurn } from "@dodi/ai/game-agent";
import type { RenderGameInput, RenderGameOutput } from "@dodi/ai/game-agent-tools";
import { runPlanAgent } from "@dodi/ai/game-plan-agent";
import { derivePlanSettings } from "@dodi/ai/plan-settings";
import { reportUsage } from "@/lib/usage/report-usage";
import {
  browserFailureMeta,
  describeError,
  reportErrorLog,
  startFailureTimer,
} from "@/lib/errors/report-error-log";
import { mapSuccessDefinition } from "@dodi/ai/success-mapping";
import type { AgentStep } from "@dodi/types/agent-progress";
import type { Game, GameVersion, Json } from "@dodi/types/database";
import type { GamePerspective } from "@dodi/types/games";
import type { AgentCodeResult, AgentTaskRequest } from "@dodi/types/tasks";
import { coerceSuccessCriteria } from "@dodi/games/game-spec";
import type { ProgressKind, SuccessCriteria } from "@dodi/games/success";

interface KidOption {
  id: string;
  name: string;
  /** Decrypted personal fields, used to assemble agent context client-side. */
  birthdate: string | null;
  memory: string | null;
  parent_notes: string | null;
  /** Operational (non-encrypted) locale, used for the agent's output language. */
  language: string;
}

export interface StudioGame {
  id: string | null;
  title: string;
  tags: string[];
  description: string;
  learningGoal: string;
  successDefinition: string;
  progressKind: ProgressKind;
  /** Structured success mapping — the baseline edit-only builds must preserve. */
  successCriteria: SuccessCriteria;
  /** Recommended player age range — a plaintext facet shown on dodi Discover. */
  targetAgeMin: number;
  targetAgeMax: number;
  codeBundle: string;
  /** Head of the game's version chain (server-managed); null = pre-versioning code. */
  currentGameVersionId: string | null;
  markdown: string;
  /** Specific kid IDs this game is shared with (empty when family). */
  audienceIds: string[];
  /** Shared with the whole family. */
  isFamily: boolean;
  /** Dodi has built this game at least once (false for a freshly-saved draft). */
  built: boolean;
  /** Playable by kids. Parent-created games start inactive until activated. */
  isActive: boolean;
  /** Required camera perspective for the design (null = dodi chooses). */
  perspective: GamePerspective | null;
  /** Generate an AI background image during builds (needs an image provider). */
  generateBackgroundImage: boolean;
  /** Generate an AI game-list preview image after builds (needs an image provider). */
  generatePreviewImage: boolean;
  /** Standard commands the built game implements (metadata.capabilities). */
  capabilities: string[];
  /** 100×100 JPEG data URL shown in game lists (E2EE at rest; null = none yet). */
  previewImage: string | null;
  /** enc:v1: sealed prior studio conversation, restored on re-entry. */
  agentTranscriptEnc?: string | null;
  /** enc:v1: sealed Plan-step state; set while the game is still being planned. */
  planEnc?: string | null;
}

/** The stage's three tabs. Doubles as the `/game-studio/{id}/{tab}` segment. */
export type StudioView = "settings" | "code" | "preview";

const STUDIO_VIEWS: readonly StudioView[] = ["settings", "code", "preview"];

export function isStudioView(value: string | undefined): value is StudioView {
  return value !== undefined && STUDIO_VIEWS.includes(value as StudioView);
}

// What the stage can show is `DraftView` (plan-state.ts): the three tabs, plus
// "plan" while the game is still being planned. "plan" is deliberately NOT a
// StudioView: it has no tab URL — `/game-studio/{id}/plan` falls back to the
// default tab like any other unknown segment, and the studio reopens on the
// Plan step from the persisted envelope instead.

interface GameStudioProps {
  initialGame?: StudioGame;
  /** Tab from the route; falls back to preview for a saved game, settings for a draft. */
  initialView?: StudioView;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Attached reference images (downscaled data URLs) on user turns. */
  images?: string[];
  /** Assistant turns whose build changed the code — anchors Show changes | Revert. */
  hasCodeChange?: boolean;
  /** What the game agent did for this reply (display only, never fed to the model). */
  run?: AgentRunLog;
}

/** Prior turns for the model: text and images only, never a run log. */
function toPriorTurns(history: ChatMessage[]): PriorTurn[] {
  return history.map((m) => ({
    role: m.role,
    text: m.text,
    ...(m.images?.length ? { images: m.images } : {}),
  }));
}

/** Lean version-history entry from GET /api/games/[id]/versions (no code). */
interface GameVersionEntry {
  id: string;
  previous_game_version_id: string | null;
  created_at: string;
}

const SIDE_MIN = 300;
const SIDE_MAX = 620;
const SIDE_DEFAULT = 384;
const COMPOSER_MIN = 60;
const COMPOSER_MAX = 520;
const COMPOSER_DEFAULT = 150;
/** One line of the composer (14.5px text at leading-normal, plus its padding).
 *  The sketch surface shrinks the input to this so the canvas gets the screen. */
const COMPOSER_ONE_LINE = 28;
/** How far the composer may grow back on a plan surface, once there is text to
 *  read. Well under the resizable height, which the canvas and the plan need
 *  more than the input does. */
const COMPOSER_SURFACE_MAX = 96;
/** Max reference images a single message can carry. */
const MAX_ATTACHMENTS = 3;
/** Sealed-transcript guard: only this many trailing messages keep their images. */
const TRANSCRIPT_IMAGE_MESSAGES = 6;
/** How long the Plan step waits after a change before re-sealing it onto the row. */
const PLANNING_PERSIST_DELAY_MS = 800;
/** Square edge of the game-list preview the generated image is cropped to. */
const PREVIEW_IMAGE_SIZE = 100;

function emptyGame(): StudioGame {
  return {
    id: null,
    title: "",
    tags: [],
    description: "",
    learningGoal: "",
    successDefinition: "",
    progressKind: "open",
    successCriteria: coerceSuccessCriteria(undefined),
    // Match the server's default recommended range for new games (games.ts).
    targetAgeMin: 4,
    targetAgeMax: 12,
    codeBundle: "",
    currentGameVersionId: null,
    markdown: "",
    audienceIds: [],
    // New games default to the whole family; parents narrow this if they want.
    isFamily: true,
    built: false,
    isActive: false,
    perspective: null,
    generateBackgroundImage: false,
    generatePreviewImage: false,
    capabilities: [],
    previewImage: null,
  };
}

/** Pull the server's error message from a failed JSON response. */
async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * The studio URL for a game and a stage view. The Plan step has no tab
 * segment (see DraftView), so it maps to the bare game URL.
 */
function studioUrl(gameId: string, view: DraftView): string {
  return view === "plan"
    ? `/parent/game-studio/${gameId}`
    : `/parent/game-studio/${gameId}/${view}`;
}

/** Read a persisted panel size from localStorage, clamped to [min, max]. */
function readStoredSize(key: string, min: number, max: number, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = parseInt(window.localStorage.getItem(key) ?? "", 10);
  return v >= min && v <= max ? v : fallback;
}

/** Unseal a persisted conversation transcript for the initial thread (resume). */
function restoreTranscript(initialGame?: StudioGame): ChatMessage[] {
  const enc = initialGame?.agentTranscriptEnc;
  if (!enc) return [];
  const session = useVaultStore.getState().session;
  if (!session) return [];
  try {
    const restored = session.decryptJson<ChatMessage[]>(enc);
    if (!Array.isArray(restored)) return [];
    // Transcripts sealed before run logs existed simply have no `run`.
    return restored.map(({ run, ...m }) => {
      const restoredRun = restoreRunLog(run);
      return restoredRun ? { ...m, run: restoredRun } : m;
    });
  } catch {
    // malformed / wrong key — start clean
    return [];
  }
}

export function GameStudio({ initialGame, initialView }: GameStudioProps) {
  const t = useTranslations("gameStudio");
  const locale = useLocale();
  const router = useRouter();
  const editing = Boolean(initialGame?.id);

  // Kid names are vault-encrypted at rest; decrypt them client-side.
  const { kids: kidRows } = useKids();
  const kids: KidOption[] = (kidRows ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    birthdate: p.birthdate,
    memory: p.memory,
    parent_notes: p.parent_notes,
    language: p.language,
  }));

  const [game, setGame] = useState<StudioGame>(initialGame ?? emptyGame());
  // The game id as of right now. `game.id` is null for a draft and is adopted
  // in place when a planned draft is saved, so callbacks that must not go stale
  // across that transition (setView's URL mirroring) read it from here.
  const gameIdRef = useRef<string | null>(initialGame?.id ?? null);

  // Surface the live game title in the shared breadcrumb bar (the studio has no
  // top bar of its own); clear it when leaving the studio.
  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    setLeaf(game.title.trim() || t("addGame"));
    return () => setLeaf(null);
  }, [game.title, setLeaf, t]);

  // The persisted Plan step, unsealed once on mount (plan-state.ts). Null for
  // a brand-new game (nothing persisted yet) and for a game past planning.
  const [restoredPlanning] = useState<PlanningState | null>(() =>
    restorePlanning(initialGame?.planEnc, useVaultStore.getState().session),
  );
  // A planning draft reopens where the parent left off (the Plan step, or the
  // settings once the plan was accepted); an existing game on its preview.
  const [view, setViewState] = useState<DraftView>(() =>
    resolveInitialView({
      initialView,
      hasId: Boolean(initialGame?.id),
      planning: restoredPlanning,
    }),
  );

  /**
   * Switch tab and mirror it into the URL so the tab is linkable and survives a
   * reload. Deliberately `history.replaceState` rather than a router navigation:
   * re-rendering this route would remount the studio and take the live chat
   * thread, a running agent build and the mounted sandbox with it. Replacing
   * (not pushing) also keeps Back meaning "leave the studio" rather than
   * unwinding a trail of tab switches. A brand-new game has no id and so no
   * URL yet.
   *
   * Keyed on the LIVE id, not `initialGame`: the first plan turn (and the
   * settings save of an unplanned draft) adopt the new id in place instead of
   * remounting the studio.
   */
  const setView = (next: DraftView): void => {
    setViewState(next);
    const gameId = gameIdRef.current;
    if (gameId && typeof window !== "undefined") {
      window.history.replaceState(null, "", studioUrl(gameId, next));
    }
  };

  // Canonicalize on entry: `/game-studio/{id}` (and anything unrecognized in the
  // tab slot) becomes the tab actually being shown, so a reload or a shared link
  // lands where the parent left off.
  useEffect(() => {
    const gameId = initialGame?.id;
    if (!gameId) return;
    const canonical = studioUrl(gameId, view);
    if (window.location.pathname !== canonical) {
      window.history.replaceState(null, "", canonical);
    }
    // Entry only — later tab switches keep the URL in step via setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGame?.id]);
  // Initial thread = the unsealed prior conversation (resume), or empty. The
  // Plan step shares it: the brainstorming turns become the head of the build
  // conversation, so the coding agent inherits everything that was discussed.
  const [messages, setMessages] = useState<ChatMessage[]>(() => restoreTranscript(initialGame));
  const [draft, setDraft] = useState("");
  // Reference images staged for the next message (downscaled data URLs).
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // File drag-over on the agent inbox: depth counter ignores enter/leave of
  // child nodes so the drop overlay doesn't flicker.
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const [thinking, setThinking] = useState(false);
  // Keep the screen awake while the agent runs — on mobile, screen dim → lock
  // kills the in-flight provider fetch and the whole build with it.
  useWakeLock(thinking);
  const [step, setStep] = useState<AgentStep | null>(null);
  // Live "working aloud" text streamed from the model while it builds — shown
  // under the thinking indicator. Ephemeral: reset per text block, never persisted.
  const [narration, setNarration] = useState("");
  // Cumulative streamed size of the current write_game_code call, rounded to
  // 200-char steps so state updates (re-renders) stay coarse. 0 = hidden.
  const [writeChars, setWriteChars] = useState(0);
  // The running build's timeline (run log), shown live in the thinking block
  // and attached to the build's reply when it ends. Null outside a build.
  const [liveRun, setLiveRun] = useState<AgentRunLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Background generation was enabled but the build produced no image — tells
  // the parent whether the model skipped the tool or generation failed.
  const [bgNotice, setBgNotice] = useState<"skipped" | "failed" | null>(null);
  // Same signal for the game-list preview image: the setting was on, the game
  // had no preview yet, and the build still ended without one.
  const [previewNotice, setPreviewNotice] = useState<"skipped" | "failed" | null>(null);
  // A screenshot service was on but never delivered frames this build. A
  // platform without a configured worker is a silent skip (see the ref), so
  // self-hosters are not nagged; real failures do get the notice.
  const [visualCheckNotice, setVisualCheckNotice] = useState(false);
  const screenshotUnavailableRef = useRef(false);
  // The account setting that picks the screenshot service (single-flight
  // shared cache; already loaded by the parent shell in the common case).
  const account = useAccountStore((s) => s.account);
  const loadAccount = useAccountStore((s) => s.load);
  // Mandatory settings fields left empty on save — drives the red field markers.
  const [invalid, setInvalid] = useState<{
    title?: boolean;
    learningGoal?: boolean;
    audience?: boolean;
    age?: boolean;
  }>({});
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // ----- Plan step -------------------------------------------------------
  // Still on the Plan step: a brand-new game, or a persisted planning draft
  // (games.plan_enc set) reopened where the parent left off. Saving the
  // settings is what ends planning.
  const [isPlanning, setIsPlanning] = useState(
    () => !initialGame?.id || restoredPlanning !== null,
  );
  const planning0 = restoredPlanning ?? EMPTY_PLANNING;
  // Which inspiration surface is open, and the image each one holds. Both are
  // kept so switching back and forth never throws work away; the one from the
  // open surface is what dodi sees.
  const [planMode, setPlanMode] = useState<"draw" | "photo">(planning0.mode);
  const [sketchImage, setSketchImage] = useState<string | null>(planning0.sketchImage);
  const [photoImage, setPhotoImage] = useState<string | null>(planning0.photoImage);
  // The sketch itself lives here, not in the pad: on a phone the pad is mounted
  // only while its surface is open, and a rotation swaps one pad for another.
  const [sketchStrokes, setSketchStrokes] = useState<SketchStroke[]>(planning0.sketchStrokes);
  // The summary on the table: dodi's proposal, or the parent's edit of it.
  const [planDraft, setPlanDraft] = useState(planning0.summary);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  // The approved text. Non-null ⇒ saving the draft starts the build with it.
  const [acceptedPlan, setAcceptedPlan] = useState<string | null>(
    planning0.isAccepted ? planning0.summary : null,
  );
  const [isDerivingSettings, setIsDerivingSettings] = useState(false);
  // A sketch/photo the parent has not shown dodi yet — it rides the next message.
  const [hasUnsentPlanImage, setHasUnsentPlanImage] = useState(false);
  // The build to start once the settings are saved (see saveSettings).
  const pendingAutoBuildRef = useRef<{ text: string; images: string[] } | null>(null);
  // This studio adopted its id in place (the first plan turn, or the settings
  // save of an unplanned draft) rather than being remounted by the router —
  // the successful save/build hands the route over instead of refreshing.
  const adoptedIdRef = useRef(false);
  // In-flight state for the header's active/inactive auto-save toggle.
  const [togglingActive, setTogglingActive] = useState(false);
  // Whether an explicit thinking model is configured (model_config.thinkingProvider).
  // Game build/edit needs it — the voice model alone can't drive the agent.
  // null = still loading, so we don't flash the warning before we know.
  const [hasGameProvider, setHasGameProvider] = useState<boolean | null>(null);
  // Whether an image model is configured AND its vault key is available — gates
  // the "generate background image" setting. null = still loading.
  const [hasImageProvider, setHasImageProvider] = useState<boolean | null>(null);
  // Code-tab diff mode — also flipped on by the per-turn "Show changes" link.
  const [showChanges, setShowChanges] = useState(false);
  // In-flight state for Revert, and whether the last change is currently
  // reverted (flips the link label to "Restore"; session-local only).
  const [reverting, setReverting] = useState(false);
  const [reverted, setReverted] = useState(false);
  // Version history (lean entries, newest first) + per-version code cache
  // (id → code), filled lazily for diff bases.
  const [versions, setVersions] = useState<GameVersionEntry[]>([]);
  const [versionCodes, setVersionCodes] = useState<Record<string, string>>({});
  // The version left behind by the last Revert, so Restore can go forward again.
  const redoVersionRef = useRef<string | null>(null);
  // Manual code-edit save dialog ("create a new version" defaults to on).
  const [saveEditOpen, setSaveEditOpen] = useState(false);
  const [saveAsNewVersion, setSaveAsNewVersion] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const pendingEditRef = useRef<{ code: string; resolve: (saved: boolean) => void } | null>(null);
  // Destructive "clear history" confirmation dialog.
  const [clearOpen, setClearOpen] = useState(false);
  const [sideWidth, setSideWidth] = useState(() =>
    readStoredSize("dodi-studio-side-width", SIDE_MIN, SIDE_MAX, SIDE_DEFAULT),
  );
  const [composerHeight, setComposerHeight] = useState(() =>
    readStoredSize("dodi-studio-input-height", COMPOSER_MIN, COMPOSER_MAX, COMPOSER_DEFAULT),
  );
  // Portrait phones + upright tablets get a vertical, tab-switched layout
  // (matches the `compact` CSS variant). Landscape/desktop keep the resizable
  // side-by-side panes.
  const vertical = useMediaQuery("(orientation: portrait), (max-width: 767px)");
  // New games open on the Game tab (the Plan step, then settings); existing
  // games open on the Dodi chat.
  const [mtab, setMtab] = useState<"game" | "chat">(
    initialGame?.id ? "chat" : "game",
  );
  // What the Plan step shows besides the conversation. On a phone the surface
  // takes the thread's place; side by side it takes the stage next to the chat.
  const [planSurface, setPlanSurface] = useState<PlanSurfaceKind>("chat");
  // "Take a photo" opens the camera straight from the chat pane. While planning
  // the photo sends itself for reading; otherwise it is staged like an upload.
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // The composer's image button offers the ways in: camera, file, sketch. The
  // sheet opens over the composer block, so it needs the block's footprint.
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  // Handle into the always-mounted preview sandbox (edit-time screenshots).
  const sandboxRef = useRef<GameSandboxHandle | null>(null);
  const sideWidthRef = useRef(sideWidth);
  const composerHeightRef = useRef(composerHeight);
  // The in-flight build's abort handle — drives Stop + navigation guards.
  const abortRef = useRef<AbortController | null>(null);

  // The Plan step is the one place a planning draft may talk to dodi: it
  // brainstorms the idea, it does not build anything.
  const isPlanMode = isPlanning && view === "plan";
  // Building is locked until the settings are saved (new-game hard gate): that
  // is what ends planning, and for an unplanned draft it also mints the id.
  const locked = isPlanning && !isPlanMode;
  const hasPlan = planDraft.trim().length > 0;
  // On a phone the Plan step IS the chat pane: no Game/dodi switch, and the
  // sketch and the plan open over the thread instead of on the other tab. A
  // surface there carries its own header and needs the height for its content,
  // so the pane's chrome steps aside: no dodi header, no footer line, and the
  // composer drops to a single line until there is something typed in it.
  const isMobilePlan = vertical && isPlanMode;
  const mobileSurfaceOpen = isMobilePlan && planSurface !== "chat";
  const panes = resolveStudioPanes({ vertical, locked, isPlanMode, mtab, planSurface });
  // Side by side, the Plan step's chat spans the studio until a surface takes
  // the stage; then the chat is the sidebar again.
  const chatFullscreen = !vertical && panes.showChat && !panes.showMain;

  // Pin the thread to the latest turn on resume, after each turn, and when the
  // chat pane becomes visible (mobile tab switch / draft unlock / a plan
  // surface closing). Measuring while hidden yields scrollHeight 0, so skip
  // until the thread is actually on screen.
  useEffect(() => {
    if (!panes.showChat || mobileSurfaceOpen) return;
    const el = threadRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, thinking, narration, writeChars, liveRun, panes.showChat, mobileSurfaceOpen]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  // Building/editing a game is a complex task that requires an explicitly
  // configured Game generation model. Without one we lock the composer (just
  // like the unsaved-draft gate) and surface a subtle warning above the input.
  const needsGameProvider = hasGameProvider === false;
  const composerLocked = locked || needsGameProvider;

  // Resolve whether a Game generation model is configured. Drives the composer
  // lock + warning so we never fall back to the voice/thinking model for a
  // build (the game agent needs an Anthropic tool-use model).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await dodi.request("/api/ai/config");
        if (cancelled) return;
        if (!res.ok) {
          setHasGameProvider(false);
          setHasImageProvider(false);
          return;
        }
        const cfg = (await res.json()) as { gameProvider?: string } | null;
        setHasGameProvider(Boolean(cfg?.gameProvider));
        // Full check incl. vault key (resolveClientImage re-reads the config).
        const image = await resolveClientImage().catch(() => null);
        if (!cancelled) {
          setHasImageProvider(Boolean(image));
          // New games default both image generations on — an illustrated
          // background and a list preview are what a game is expected to look
          // like. Only once an image provider is confirmed, though, so accounts
          // without an image model never save a flag (or a checked-but-disabled
          // switch) they can't use. Existing games keep their own settings.
          if (image && !editing) {
            setGame((g) =>
              g.id ? g : { ...g, generatePreviewImage: true, generateBackgroundImage: true },
            );
          }
        }
      } catch {
        if (!cancelled) {
          setHasGameProvider(false);
          setHasImageProvider(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `editing` is fixed for a mounted studio (derived from initialGame), so
    // this still runs exactly once per mount.
  }, [editing]);

  const startSideResize = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideWidthRef.current;
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent): void => {
      const next = Math.min(SIDE_MAX, Math.max(SIDE_MIN, startW + (startX - ev.clientX)));
      sideWidthRef.current = next;
      setSideWidth(next);
    };
    const up = (): void => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      localStorage.setItem("dodi-studio-side-width", String(sideWidthRef.current));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const startComposerResize = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = composerHeightRef.current;
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent): void => {
      const next = Math.min(COMPOSER_MAX, Math.max(COMPOSER_MIN, startH + (startY - ev.clientY)));
      composerHeightRef.current = next;
      setComposerHeight(next);
    };
    const up = (): void => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      localStorage.setItem("dodi-studio-input-height", String(composerHeightRef.current));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const setField = <K extends keyof StudioGame>(key: K, value: StudioGame[K]) => {
    setGame((g) => ({ ...g, [key]: value }));
    // Editing a previously-flagged mandatory field clears its red state.
    if (key === "title" || key === "learningGoal") {
      setInvalid((v) => ({ ...v, [key]: false }));
    }
    if (key === "targetAgeMin" || key === "targetAgeMax") {
      setInvalid((v) => ({ ...v, age: false }));
    }
  };

  // ── "Who can play" selection ───────────────────────────────────────────
  const primaryKidId = game.isFamily
    ? (kids[0]?.id ?? null)
    : (game.audienceIds[0] ?? null);
  // ── Preview locale ─────────────────────────────────────────────────────
  // Defaults to the kid's game language (= the source locale of new builds);
  // the picker lets the parent test each platform language. Only games with a
  // translations block react to it, so the picker hides otherwise.
  const [previewLocaleChoice, setPreviewLocaleChoice] = useState<string | null>(null);
  const previewLocale =
    previewLocaleChoice ??
    normalizeLocale(kids.find((k) => k.id === primaryKidId)?.language ?? locale);
  const previewHasTranslations = game.codeBundle
    ? hasTranslationsBlock(game.codeBundle)
    : false;
  const selectedKids = game.isFamily
    ? kids
    : kids.filter((k) => game.audienceIds.includes(k.id));
  const selectFamily = (): void => {
    setGame((g) => ({ ...g, isFamily: true, audienceIds: [] }));
    setInvalid((v) => ({ ...v, audience: false }));
  };
  const toggleKid = (id: string): void => {
    setGame((g) => {
      const has = g.audienceIds.includes(id);
      return {
        ...g,
        isFamily: false,
        audienceIds: has ? g.audienceIds.filter((x) => x !== id) : [...g.audienceIds, id],
      };
    });
    setInvalid((v) => ({ ...v, audience: false }));
  };

  // Resume: the initial thread is unsealed from the persisted transcript in the
  // useState initializer above (restoreTranscript), so re-entry picks up where
  // the parent left off — a locked vault or wrong key just yields an empty thread.

  // Keep the sealed transcript bounded: images beyond the trailing window are
  // display-only history nobody re-feeds — drop them from the sealed copy so
  // agent_transcript_enc doesn't grow by hundreds of KB per attachment forever.
  // Run logs are bounded the same way: only the trailing runs keep their
  // (thumbnail) frames, and full-size captures never leave the session.
  const sealableTranscript = (transcript: ChatMessage[]): ChatMessage[] =>
    boundRunLogs(transcript).map((m, i) =>
      m.images?.length && i < transcript.length - TRANSCRIPT_IMAGE_MESSAGES
        ? { ...m, images: undefined }
        : m,
    );

  // Persist the (sealed) conversation alongside the game. `null` clears it.
  const persistTranscript = async (transcript: ChatMessage[] | null): Promise<void> => {
    if (!game.id) return;
    const session = useVaultStore.getState().session;
    const agent_transcript_enc =
      transcript && transcript.length > 0 && session
        ? session.encryptJson(sealableTranscript(transcript))
        : null;
    await dodi.request(`/api/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_transcript_enc }),
    });
  };

  // ----- Plan step persistence -------------------------------------------
  // Once the parent has talked to the plan agent the draft is worth keeping:
  // the first turn creates the game row (adopting its id in place, like a
  // planned save does) and every later change to the thread, the plan or the
  // sketch/photo re-seals the Plan-step envelope onto it (games.plan_enc). So
  // the parent can leave mid-planning and pick up where they left off.
  //
  // Writes read the latest state through refs (they run from timers, after
  // the render that changed something), are debounced so a burst of strokes
  // costs one upload, and run one at a time so the create always lands before
  // the first patch.
  const planningRef = useRef<PlanningState>(EMPTY_PLANNING);
  const messagesRef = useRef(messages);
  const gameRef = useRef(game);
  useEffect(() => {
    planningRef.current = {
      summary: planDraft,
      isAccepted: acceptedPlan !== null,
      mode: planMode,
      sketchImage,
      photoImage,
      sketchStrokes,
    };
    messagesRef.current = messages;
    gameRef.current = game;
  });
  const planningDirtyRef = useRef(false);
  // The write loop in flight, so a settings save can wait for it: a planning
  // write landing after the save would resurrect the envelope it just cleared.
  const planningInflightRef = useRef<Promise<void> | null>(null);

  const persistPlanningNow = async (): Promise<void> => {
    const session = useVaultStore.getState().session;
    if (!session) return;
    const transcript = messagesRef.current;
    const current = gameRef.current;
    const planningState = planningRef.current;
    const agentTranscriptEnc =
      transcript.length > 0 ? session.encryptJson(sealableTranscript(transcript)) : null;
    const planEnc = session.encryptJson(planningState);

    const id = gameIdRef.current;
    if (id) {
      // An accepted plan also carries the settings derived from it, so a
      // parent who leaves before saving finds the form filled in on return.
      const derived = planningState.isAccepted
        ? {
            ...(await sealGameFields({
              title: current.title,
              learning_goal: current.learningGoal,
              success_definition: current.successDefinition,
            })),
            tags: current.tags,
            ...(isValidAgeRange(current.targetAgeMin, current.targetAgeMax)
              ? { target_age_min: current.targetAgeMin, target_age_max: current.targetAgeMax }
              : {}),
            metadata: { perspective: current.perspective },
          }
        : {};
      const res = await dodi.request(`/api/games/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...derived,
          agent_transcript_enc: agentTranscriptEnc,
          plan_enc: planEnc,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      useGameStore.getState().put(await decryptGameResponse((await res.json()) as Game));
      return;
    }

    // First turn: create the row. Mirrors the settings save of a brand-new
    // game (sealed placeholder bundle, inactive, whole family) minus the
    // settings themselves, which the parent has not filled in yet. Without a
    // kid to own the row there is nothing to attach it to — planning simply
    // stays in the browser, as it did before.
    const kidId = current.isFamily ? (kids[0]?.id ?? null) : (current.audienceIds[0] ?? null);
    if (!kidId) return;
    const sealed = await sealGameCreateFields({
      title: current.title.trim(),
      codeBundle: UNBUILT_GAME_PLACEHOLDER,
    });
    const res = await dodi.request("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kidId,
        ...sealed,
        targetAgeMin: current.targetAgeMin,
        targetAgeMax: current.targetAgeMax,
        isActive: false,
        audience: { isFamily: current.isFamily, audienceIds: current.audienceIds },
        ...(agentTranscriptEnc ? { agentTranscriptEnc } : {}),
        planEnc,
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = (await res.json()) as { id: string };
    useGameStore.getState().invalidate();
    // Adopt the id in place: a navigation would remount the studio and take
    // the live thread, the sketch and a running plan turn with it. The URL is
    // corrected here; the route is handed over once the settings are saved.
    adoptedIdRef.current = true;
    gameIdRef.current = data.id;
    setGame((g) => ({ ...g, id: data.id }));
    window.history.replaceState(null, "", studioUrl(data.id, "plan"));
  };

  // Drain the dirty flag: one write at a time, and again if anything changed
  // while a write was in flight. A failed write is reported once and the
  // state stays in the browser — the next change tries again.
  const flushPlanning = async (): Promise<void> => {
    if (planningInflightRef.current) return;
    const run = (async () => {
      while (planningDirtyRef.current) {
        planningDirtyRef.current = false;
        try {
          await persistPlanningNow();
        } catch (err) {
          console.error("[game-studio] persisting the plan draft failed", err);
          const reason = err instanceof Error ? err.message : "";
          setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
          reportErrorLog({
            context: "game_save",
            kidId: primaryKidId,
            gameId: gameIdRef.current,
            ...describeError(err, []),
          });
        }
      }
    })();
    planningInflightRef.current = run;
    try {
      await run;
    } finally {
      planningInflightRef.current = null;
    }
  };
  const flushPlanningRef = useRef(flushPlanning);
  useEffect(() => {
    flushPlanningRef.current = flushPlanning;
  });

  // Mark the Plan step dirty on every change once there has been an
  // interaction (a message in the thread), and write it out after a pause.
  // Past planning the envelope is gone (cleared by the settings save) and
  // nothing here runs again.
  useEffect(() => {
    if (!isPlanning || messages.length === 0) return;
    planningDirtyRef.current = true;
    const timer = setTimeout(() => void flushPlanningRef.current(), PLANNING_PERSIST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isPlanning, messages, planDraft, acceptedPlan, planMode, sketchImage, photoImage, sketchStrokes]);

  // Leaving the studio (a client-side navigation) flushes a pending write —
  // the request outlives the component, the state lives on the server.
  useEffect(
    () => () => {
      if (planningDirtyRef.current) void flushPlanningRef.current();
    },
    [],
  );

  // Persist a completed build — game fields + sealed transcript, no provider key
  // (generation already happened in the browser). The studio always has a game id
  // here (the composer is locked until the draft is saved). Returns the updated
  // row so the caller can adopt the new version-chain head.
  const persistBuild = async (
    result: AgentCodeResult,
    safeCode: string,
    transcript: ChatMessage[],
  ): Promise<Game | null> => {
    if (!game.id) return null;
    const session = useVaultStore.getState().session;
    const agent_transcript_enc = session
      ? session.encryptJson(sealableTranscript(transcript))
      : null;
    const sealed = await sealGameFields({
      title: result.title || undefined,
      description: result.description,
      code_bundle: safeCode,
      markdown: result.markdown,
      learning_goal: result.learningGoal,
      success_definition: result.successDefinition,
      success_criteria: result.successCriteria as unknown as Json,
      // The agent-generated list preview rides along with the build persist.
      ...(result.previewImage ? { preview_image: result.previewImage } : {}),
    });
    const res = await dodi.request(`/api/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...sealed,
        tags: result.tags,
        progress_kind: result.progressKind,
        metadata: result.metadata,
        agent_transcript_enc,
        audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const saved = await decryptGameResponse((await res.json()) as Game);
    useGameStore.getState().put(saved);
    return saved;
  };

  // ----- Game-list preview image -----------------------------------------

  // Client-side preview-image generation injected into the agent loop (only
  // when the setting is on): resolve provider + vault key, generate a square
  // icon — with the game's background image riding along as a style reference
  // when one exists — then crop it to the 100×100 list preview ourselves.
  const makePreviewImage = async (
    scene: string,
    backgroundImage?: string,
  ): Promise<string> => {
    const image = await resolveClientImage();
    if (!image) throw new Error("No image provider configured");
    const provider = createClientImageProvider(image.provider, image.apiKey, image.model);
    const generated = await provider.generateImage(
      buildPreviewPrompt(scene, { hasStyleReference: Boolean(backgroundImage) }),
      {
        aspectRatio: "1:1",
        referenceImages: backgroundImage ? [backgroundImage] : undefined,
      },
    );
    const square = await squareThumbnailDataUrl(generated.dataUrl, PREVIEW_IMAGE_SIZE);
    if (!square) {
      gameDebugWarn("preview", "cropping the generated preview image failed");
      throw new Error("Preview image processing failed");
    }
    return square;
  };

  // ----- Visual check (screenshot service) --------------------------------

  // Which screenshot service this build may use, from the account setting.
  // "custom" needs the unlocked vault to open the sealed URL; anything that
  // cannot be resolved means no visual check this build.
  const resolveScreenshotTarget = (): ScreenshotTarget | null => {
    const setting = gameScreenshotServiceOf(account);
    if (setting.mode === "dodi") {
      return isDodiScreenshotServiceUnavailable() ? null : { mode: "dodi" };
    }
    if (setting.mode === "custom" && setting.customUrlEnc) {
      const session = useVaultStore.getState().session;
      if (!session) return null;
      try {
        const url = session.decryptField(setting.customUrlEnc);
        return url ? { mode: "custom", url } : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  // Client-side render injected into the agent loop: the sandbox document goes
  // to the configured service and real frames come back for the model to look
  // at. This is the moment game code leaves the browser, and the only one.
  const makeGameView = async (input: RenderGameInput): Promise<RenderGameOutput | null> => {
    const target = resolveScreenshotTarget();
    if (!target) return null;
    const output = await captureGameFrames(input, target);
    if (!output && isDodiScreenshotServiceUnavailable()) screenshotUnavailableRef.current = true;
    return output;
  };

  // Export and publish live in the game list's actions menu, not here — both act
  // on the persisted row, so they don't need the studio's live state.

  // Clear the conversation — the local thread and the persisted (sealed) copy.
  const clearHistory = (): void => {
    setClearOpen(false);
    setMessages([]);
    void persistTranscript(null).catch(() => {
      /* best effort — the local thread is already cleared */
    });
  };

  // Stop the in-browser agent loop; send()'s finally block resets the UI.
  const stop = (): void => {
    abortRef.current?.abort();
  };

  // ----- Version history -------------------------------------------------

  // Refresh the lean version list (after builds / manual saves).
  const loadVersions = useCallback(async (): Promise<void> => {
    if (!game.id) return;
    try {
      const res = await dodi.request(`/api/games/${game.id}/versions`);
      if (!res.ok) return;
      const data = (await res.json()) as { versions: GameVersionEntry[] };
      setVersions(data.versions);
    } catch {
      /* history is non-critical chrome — the studio works without it */
    }
  }, [game.id]);

  useEffect(() => {
    void (async () => {
      await loadVersions();
    })();
  }, [loadVersions]);

  const currentVersion = versions.find((v) => v.id === game.currentGameVersionId) ?? null;
  const previousVersionId = currentVersion?.previous_game_version_id ?? null;

  // Lazily fetch the diff base (previous version's code) into the cache map;
  // `previousCode` is then a pure derivation (no sync setState in the effect).
  useEffect(() => {
    const gameId = game.id;
    if (!gameId || !previousVersionId) return;
    if (versionCodes[previousVersionId] !== undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await dodi.request(`/api/games/${gameId}/versions/${previousVersionId}`);
        if (!res.ok) return;
        const row = await decryptVersionResponse((await res.json()) as GameVersion);
        if (!cancelled) {
          setVersionCodes((m) => ({ ...m, [previousVersionId]: row.code_bundle }));
        }
      } catch {
        /* diff stays unavailable — non-critical chrome */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id, previousVersionId, versionCodes]);

  const previousCode = previousVersionId ? (versionCodes[previousVersionId] ?? null) : null;

  // A previous version exists and differs — enables Show changes / Revert.
  const canDiff = Boolean(previousCode) && previousCode !== game.codeBundle;

  // "Show changes" chat link: jump to the Code tab with the diff switched on.
  const openChanges = (): void => {
    setShowChanges(true);
    setView("code");
    if (vertical) setMtab("game");
  };

  // Switch the game to an existing version: the server copies that version's
  // code into the game and moves the head pointer — no new version row.
  const switchToVersion = async (versionId: string): Promise<boolean> => {
    if (!game.id || reverting || thinking || versionId === game.currentGameVersionId)
      return false;
    setReverting(true);
    setError(null);
    try {
      const res = await dodi.request(`/api/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore_version_id: versionId }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const row = await decryptGameResponse((await res.json()) as Game);
      useGameStore.getState().put(row);
      setGame((g) => ({
        ...g,
        codeBundle: row.code_bundle,
        currentGameVersionId: row.current_game_version_id,
      }));
      router.refresh();
      return true;
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
      return false;
    } finally {
      setReverting(false);
    }
  };

  // Revert = step back to the previous version; Restore = forward to the
  // version the last revert left (session-local, like the old swap toggle).
  const revertCode = async (): Promise<void> => {
    if (reverted) {
      const redo = redoVersionRef.current;
      if (redo && (await switchToVersion(redo))) {
        redoVersionRef.current = null;
        setReverted(false);
      }
      return;
    }
    if (!previousVersionId) return;
    const leaving = game.currentGameVersionId;
    if (await switchToVersion(previousVersionId)) {
      redoVersionRef.current = leaving;
      setReverted(true);
    }
  };

  // Explicit version pick from the selector — plain switch, no redo memory.
  const selectVersion = (versionId: string): void => {
    redoVersionRef.current = null;
    setReverted(false);
    void switchToVersion(versionId);
  };

  // Manual editor save: stash the draft and ask about creating a new version.
  // The promise resolves once the dialog settles (true = saved, edit mode ends).
  const handleSaveEdit = (code: string): Promise<boolean> => {
    if (!game.id) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pendingEditRef.current = { code, resolve };
      setSaveAsNewVersion(true);
      setSaveEditOpen(true);
    });
  };

  const settleSaveEdit = (saved: boolean): void => {
    pendingEditRef.current?.resolve(saved);
    pendingEditRef.current = null;
    setSaveEditOpen(false);
  };

  const confirmSaveEdit = async (): Promise<void> => {
    const pending = pendingEditRef.current;
    if (!pending || !game.id || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      // Sanitize the hand-edited code before sealing it — once encrypted, no
      // later layer can inspect it.
      const safeCode = sanitizeGameBundle(pending.code).code;
      const sealed = await sealGameFields({ code_bundle: safeCode });
      const res = await dodi.request(`/api/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sealed,
          create_version: saveAsNewVersion,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const row = await decryptGameResponse((await res.json()) as Game);
      useGameStore.getState().put(row);
      // Head overwritten in place → refresh its cached code with the saved result.
      if (!saveAsNewVersion && row.current_game_version_id) {
        const headId = row.current_game_version_id;
        setVersionCodes((m) => ({ ...m, [headId]: row.code_bundle }));
      }
      setGame((g) => ({
        ...g,
        codeBundle: row.code_bundle,
        currentGameVersionId: row.current_game_version_id,
      }));
      redoVersionRef.current = null;
      setReverted(false);
      await loadVersions();
      settleSaveEdit(true);
      router.refresh();
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
      settleSaveEdit(false);
    } finally {
      setSavingEdit(false);
    }
  };

  // Selector entries, newest first; the viewer renders the short id itself and
  // hides the date on narrow screens.
  const versionOptions = versions.map((v) => ({
    id: v.id,
    dateLabel: new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v.created_at)),
  }));

  // Edit-mode search panel strings, keyed by CodeMirror's English defaults
  // (its phrase-translation contract; "$" is CodeMirror's placeholder).
  const searchPhrases: Record<string, string> = {
    Find: t("codeSearchFind"),
    Replace: t("codeSearchReplace"),
    next: t("codeSearchNext"),
    previous: t("codeSearchPrevious"),
    "match case": t("codeSearchMatchCase"),
    regexp: t("codeSearchRegexp"),
    "by word": t("codeSearchByWord"),
    replace: t("codeSearchReplaceNext"),
    "replace all": t("codeSearchReplaceAll"),
    close: t("codeSearchClose"),
    "Toggle replace": t("codeSearchToggleReplace"),
    "no results": t("codeSearchNoResults"),
    of: t("codeSearchOf"),
    "current match": t("codeSearchCurrentMatch"),
    "on line": t("codeSearchOnLine"),
    "replaced $ matches": t("codeSearchReplacedMatches"),
    "replaced match on line $": t("codeSearchReplacedOnLine"),
  };

  // ----- End version history ---------------------------------------------

  // Stage picked/pasted/dropped reference images: read → downscale to a bounded
  // JPEG → append (capped). Non-images and unreadable files are skipped silently.
  const addImages = async (files: File[]): Promise<void> => {
    const scaled: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const raw = await fileToDataUrl(file);
        const small = await downscaleDataUrl(raw, { maxWidth: 1024, maxHeight: 1024, quality: 0.8 });
        if (small) scaled.push(small);
      } catch {
        /* unreadable file — skip */
      }
    }
    if (scaled.length) {
      setPendingImages((prev) => capImages(prev, scaled, MAX_ATTACHMENTS));
    }
  };

  // True when the OS drag payload includes files (not e.g. text selections).
  const hasFileDrag = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types).includes("Files");

  const clearDragOver = (): void => {
    dragDepthRef.current = 0;
    setIsDragOver(false);
  };

  const onInboxDragEnter = (e: React.DragEvent): void => {
    if (composerLocked || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const onInboxDragLeave = (e: React.DragEvent): void => {
    if (!isDragOver) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) clearDragOver();
  };

  const onInboxDragOver = (e: React.DragEvent): void => {
    if (composerLocked || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const onInboxDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    clearDragOver();
    if (composerLocked) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void addImages(files);
  };

  // The loop runs inside this tab — warn before any action that would kill it.
  useNavigationGuard(thinking, t("leaveWhileRunningConfirm"));

  const stepLabel = (s: AgentStep): string => {
    const map: Record<AgentStep, string> = {
      reading_docs: t("stepReadingDocs"),
      generating_image: t("stepGeneratingImage"),
      generating_preview: t("stepGeneratingPreview"),
      writing_code: t("stepWritingCode"),
      validating: t("stepValidating"),
      fixing_validation: t("stepFixingValidation"),
      visual_check: t("stepVisualCheck"),
      finalizing: t("stepFinalizing"),
    };
    return map[s];
  };

  // Bound an image for the bundle: downscale to the stage size, recompress once
  // if it's still heavy (~160k data-URL chars ≈ 120KB binary).
  const boundBackgroundImage = async (dataUrl: string): Promise<string> => {
    let scaled = await downscaleDataUrl(dataUrl, {
      maxWidth: STAGE.logicalWidth,
      maxHeight: STAGE.logicalHeight,
      quality: 0.8,
    });
    if (scaled && scaled.length > 160_000) {
      scaled = await downscaleDataUrl(dataUrl, {
        maxWidth: STAGE.logicalWidth,
        maxHeight: STAGE.logicalHeight,
        quality: 0.6,
      });
    }
    if (!scaled) throw new Error("Background image processing failed");
    return scaled;
  };

  // Client-side background-image generation injected into the agent loop (only
  // when the setting is on): resolve provider + vault key, generate at the
  // stage's aspect, and bound the result before it enters the bundle.
  const makeBackgroundImage = async (scene: string): Promise<string> => {
    const image = await resolveClientImage();
    if (!image) throw new Error("No image provider configured");
    const provider = createClientImageProvider(image.provider, image.apiKey, image.model);
    const generated = await provider.generateImage(
      buildBackgroundPrompt(scene, game.perspective),
      { aspectRatio: `${STAGE.aspectW}:${STAGE.aspectH}` },
    );
    return boundBackgroundImage(generated.dataUrl);
  };

  // ----- Plan step --------------------------------------------------------

  /** The inspiration image of the surface the parent has open. */
  const planImage = planMode === "draw" ? sketchImage : photoImage;

  /**
   * One brainstorming turn with the plan agent. Runs in the browser on the
   * game provider (same key, same drivers as a build) and produces prose plus,
   * usually, a plan proposal — never code and never a game row.
   */
  async function sendPlanMessage(text: string, explicitImages?: string[]): Promise<void> {
    if (!text.trim() || thinking) return;
    if (needsGameProvider) {
      setError(t("needThinkingProvider"));
      return;
    }
    setError(null);
    setDraft("");
    // Every plan turn is answered in the thread. On a phone a surface hides
    // it, so leave whichever one the parent started from (sketch, plan); side
    // by side the thread is in view anyway and the surface can stay.
    if (vertical) setPlanSurface("chat");

    // The sketch/photo rides along the first message after it changed; later
    // turns refer back to it through the conversation.
    const fresh = explicitImages ?? (hasUnsentPlanImage && planImage ? [planImage] : []);
    const attachments = capImages([], [...fresh, ...pendingImages], MAX_ATTACHMENTS);
    setPendingImages([]);
    setHasUnsentPlanImage(false);

    const history = messages;
    const withUser: ChatMessage[] = [
      ...history,
      { role: "user", text, ...(attachments.length ? { images: attachments } : {}) },
    ];
    setMessages(withUser);
    setThinking(true);
    setNarration("");

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = startFailureTimer();
    let gameCfg: Awaited<ReturnType<typeof resolveClientGame>> = null;
    try {
      gameCfg = await resolveClientGame();
      if (!gameCfg) {
        setThinking(false);
        setError(t("needProviderKey"));
        return;
      }

      // No audience is chosen during planning, so the context spans the whole
      // family: the plan should fit whoever ends up playing it.
      const kid = kids.find((k) => k.id === primaryKidId);
      const learningContext = buildLearningContext(
        kids,
        { isFamily: true, audienceIds: [] },
        primaryKidId ?? "",
      );

      const result = await runPlanAgent({
        provider: gameCfg.provider,
        apiKey: gameCfg.apiKey,
        model: gameCfg.model,
        childContext: {
          age: calculateChildAge(kid?.birthdate ?? null) ?? undefined,
          language: getLanguageDisplayName(kid?.language ?? "en"),
          learningContext,
        },
        priorTurns: toPriorTurns(history),
        message: { text, images: attachments.length ? attachments : undefined },
        currentPlan: planDraft || null,
        // The studio is a parent surface — dodi answers in the parent's language.
        replyLanguage: getLanguageDisplayName(locale),
        signal: controller.signal,
        onActivity: (e) => {
          if (e.type === "narration_start") setNarration("");
          else if (e.type === "narration_delta") setNarration((n) => n + e.text);
        },
      });

      if (result.plan) {
        setPlanDraft(result.plan.summary);
        setIsEditingPlan(false);
        // Side by side there is room to put the plan on the stage as it
        // arrives; on a phone it would cover the reply, so the pill waits.
        if (!vertical) setPlanSurface("plan");
      }

      const ctxSizes = measureLearningContext(
        kids,
        { isFamily: true, audienceIds: [] },
        primaryKidId ?? "",
      );
      reportUsage({
        eventType: "game_plan",
        kidId: primaryKidId,
        // Null on the very first turn: the row is created right after it.
        gameId: gameIdRef.current,
        provider: gameCfg.provider,
        model: gameCfg.model,
        usage: result.usage,
        meta: {
          turns: result.turns,
          promptChars: text.length,
          memoryChars: ctxSizes.memoryChars,
          parentNotesChars: ctxSizes.parentNotesChars,
        },
      });

      const reply = result.reply.trim() || (result.plan ? t("planProposedFallback") : "");
      const note = result.plan ? `\n\n${t("planUpdatedNote")}` : "";
      if (reply) setMessages([...withUser, { role: "assistant", text: reply + note }]);
    } catch (err) {
      if (err instanceof AgentAbortedError || controller.signal.aborted) {
        setMessages((m) => [...m, { role: "assistant", text: t("stopped") }]);
      } else {
        console.error("[game-studio] plan turn failed", err);
        reportErrorLog({
          context: "game_plan",
          kidId: primaryKidId,
          gameId: gameIdRef.current,
          provider: gameCfg?.provider,
          model: gameCfg?.model,
          ...describeError(err, gameCfg ? [gameCfg.apiKey] : []),
          meta: browserFailureMeta(startedAt, {}),
        });
        setError(t("planFailed"));
        setMessages((m) => [...m, { role: "assistant", text: t("planFailed") }]);
      }
    } finally {
      setThinking(false);
      setNarration("");
      abortRef.current = null;
    }
  }

  /**
   * Put a plan image (sketch or photo) into the composer, staged as an
   * attachment. Opening the conversation with it also fills in the matching
   * request as the message text, so the parent reads and adjusts what dodi is
   * asked before sending; once the conversation is under way the image just
   * joins whatever the parent writes next. Typed text is never overwritten.
   */
  const stagePlanImage = (
    image: string,
    promptKey: "planAnalyzePhotoPrompt" | "planAnalyzeSketchPrompt",
  ): void => {
    setPendingImages((prev) => capImages(prev, [image], MAX_ATTACHMENTS));
    setHasUnsentPlanImage(false);
    if (messages.length === 0) setDraft((d) => (d.trim() ? d : t(promptKey)));
  };

  /** Stage a photo of a real-world task for dodi to read. */
  const onPhotoPicked = async (file: File): Promise<void> => {
    if (!file.type.startsWith("image/")) return;
    try {
      const raw = await fileToDataUrl(file);
      const small = await downscaleDataUrl(raw, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.8,
      });
      if (!small) return;
      setPhotoImage(small);
      stagePlanImage(small, "planAnalyzePhotoPrompt");
    } catch {
      /* unreadable file — the parent can pick another */
    }
  };

  const onSketchChange = (dataUrl: string | null): void => {
    setSketchImage(dataUrl);
    setHasUnsentPlanImage(Boolean(dataUrl));
  };

  /** "Attach to chat" on the sketch surface. On a phone the composer is behind
   *  the surface, so the surface closes to show the staged sketch. */
  const attachSketch = (): void => {
    if (!sketchImage) return;
    stagePlanImage(sketchImage, "planAnalyzeSketchPrompt");
    if (vertical) setPlanSurface("chat");
  };

  /**
   * Accept the plan on the table: derive the settings from the FINAL text (the
   * parent may have rewritten it), then move on to settings. A failed
   * derivation is not fatal — the parent fills the form themselves.
   */
  async function acceptPlan(): Promise<void> {
    const text = planDraft.trim();
    if (!text || isDerivingSettings || thinking) return;
    setIsDerivingSettings(true);
    setError(null);
    try {
      const gameCfg = await resolveClientGame();
      if (gameCfg) {
        const kid = kids.find((k) => k.id === primaryKidId);
        const settings = await derivePlanSettings(
          { providerId: gameCfg.provider, modelId: gameCfg.model, apiKey: gameCfg.apiKey },
          text,
          {
            kidAge: calculateChildAge(kid?.birthdate ?? null) ?? undefined,
            language: getLanguageDisplayName(locale),
            defaultAgeMin: game.targetAgeMin,
            defaultAgeMax: game.targetAgeMax,
          },
          (usage) =>
            reportUsage({
              eventType: "game_plan",
              kidId: primaryKidId,
              gameId: gameIdRef.current,
              provider: gameCfg.provider,
              model: gameCfg.model,
              usage,
            }),
        );
        setGame((g) => ({
          ...g,
          // A name the parent typed themselves wins over a derived one.
          title: g.title.trim() || settings.title,
          learningGoal: settings.learningGoal || g.learningGoal,
          successDefinition: settings.successDefinition || g.successDefinition,
          tags: settings.tags.length ? settings.tags : g.tags,
          targetAgeMin: settings.targetAgeMin,
          targetAgeMax: settings.targetAgeMax,
          perspective: settings.perspective,
        }));
      }
    } catch (err) {
      console.error("[game-studio] deriving settings from the plan failed", err);
      setError(t("planSettingsFailed"));
    } finally {
      setIsDerivingSettings(false);
      setAcceptedPlan(text);
      setIsEditingPlan(false);
      setPlanSurface("chat");
      setView("settings");
    }
  }

  /** Skip planning: the draft carries no plan, so saving behaves as it always did. */
  const skipPlan = (): void => {
    setAcceptedPlan(null);
    setPlanSurface("chat");
    setView("settings");
  };

  /** Draw the screen you imagine — the sketch takes over the thread area. */
  const openSketchSurface = (): void => {
    setPlanMode("draw");
    setPlanSurface("sketch");
  };

  /** Photograph a worksheet: the camera opens, and the photo sends itself. */
  const openPlanCamera = (): void => {
    setPlanMode("photo");
    cameraInputRef.current?.click();
  };

  /** The camera from the composer: the plan's photo while planning, an
   *  attachment for the next message otherwise. */
  const openCamera = (): void => {
    if (isPlanMode) openPlanCamera();
    else cameraInputRef.current?.click();
  };

  /** Extra inputs for a build the studio starts itself (the accepted plan). */
  interface SendOptions {
    /** Images for THIS message, instead of whatever is staged in the composer. */
    images?: string[];
    /** The prompt is a plan the parent approved — build it, don't reinterpret it. */
    isAgreedPlan?: boolean;
  }

  async function send(raw?: string, opts?: SendOptions): Promise<void> {
    const text = (raw ?? draft).trim();
    if (!text || thinking) return;
    // In the Plan step the same composer talks to the planning agent instead —
    // brainstorming, no code, no game row needed.
    if (isPlanMode) {
      await sendPlanMessage(text);
      return;
    }
    // New-game hard gate: a draft must be persisted (giving us a game id) before
    // Dodi can build. The composer is disabled in this state, but guard anyway.
    if (locked) {
      setError(t("saveBeforeBuild"));
      setView("settings");
      return;
    }
    // Defensive: the composer is disabled when no thinking model is configured,
    // but starter buttons / Enter could still reach here.
    if (needsGameProvider) {
      setError(t("needThinkingProvider"));
      return;
    }
    if (!primaryKidId) {
      setInvalid((v) => ({ ...v, audience: true }));
      setView("settings");
      return;
    }
    setError(null);
    setBgNotice(null);
    setPreviewNotice(null);
    setVisualCheckNotice(false);
    setDraft("");
    // Attachments belong to this message — stage them and clear the strip. A
    // studio-started build (the accepted plan) brings its own image instead.
    const attachments = opts?.images ?? pendingImages;
    setPendingImages([]);
    // Capture the conversation before this prompt so we can seed the agent's
    // continuity on resume, then show the new user turn.
    const history = messages;
    const withUser: ChatMessage[] = [
      ...history,
      { role: "user", text, ...(attachments.length ? { images: attachments } : {}) },
    ];
    setMessages(withUser);
    setThinking(true);
    setStep(null);
    setNarration("");
    setWriteChars(0);
    // Record what the agent does this build (steps, narration, screenshot
    // checks) for the "How dodi built this" timeline under its reply.
    const recorder = createAgentRunRecorder({
      onChange: setLiveRun,
      thumbnail: (url) => downscaleDataUrl(url, RUN_FRAME_BOUND),
    });
    setLiveRun(null);
    const finishRun = (outcome: AgentRunOutcome): { run: AgentRunLog } => ({
      run: recorder.finish(outcome),
    });

    // First build of a freshly-saved draft uses generate_game semantics (build
    // from scratch) even though the game id exists; later edits are updates.
    const isUpdate = game.built;

    // Edit tasks attach a screenshot of the current game so the model sees what
    // it is changing. Best-effort: capture failure → text-only edit.
    let screenshot: string | undefined;
    if (isUpdate && sandboxRef.current) {
      const raw = await sandboxRef.current
        .requestSnapshot({ preferGameCapture: game.capabilities.includes("get_snapshot") })
        .catch(() => null);
      const scaled = raw
        ? await downscaleDataUrl(raw, { maxWidth: 768, maxHeight: 960, quality: 0.8 })
        : null;
      screenshot = scaled ?? undefined;
    }

    const payload = isUpdate
      ? {
          instruction: text,
          screenshot,
          existingCode: game.codeBundle,
          existingMarkdown: game.markdown,
          // Baseline for surgical edits: an edit-only build returns these
          // unchanged, so persistBuild cannot wipe them.
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
          images: attachments.length ? attachments : undefined,
        }
      : {
          prompt: text,
          isAgreedPlan: opts?.isAgreedPlan || undefined,
          title: game.title || undefined,
          tags: game.tags,
          learningGoal: game.learningGoal || undefined,
          successDefinition: game.successDefinition || undefined,
          perspective: game.perspective ?? undefined,
          images: attachments.length ? attachments : undefined,
        };

    const controller = new AbortController();
    abortRef.current = controller;
    // Failure telemetry inputs: the loop runs entirely in the browser, so the
    // report below is the only trace a failed build leaves anywhere.
    const startedAt = startFailureTimer();
    let lastStep: AgentStep | null = null;
    let gameCfg: Awaited<ReturnType<typeof resolveClientGame>> = null;
    try {
      // The provider key lives only in the unlocked vault — resolve it here and
      // run the ENTIRE agent loop in the browser, so it never reaches our servers.
      gameCfg = await resolveClientGame();
      if (!gameCfg) {
        setThinking(false);
        setError(t("needProviderKey"));
        return;
      }

      const kid = kids.find((k) => k.id === primaryKidId);

      // Memory/parent-notes, birthdate and name are E2EE — assemble the agent's
      // learning context, age and language in the browser. None of this leaves
      // the tab: the loop calls the provider directly with the vault key.
      const learningContext = buildLearningContext(
        kids,
        { isFamily: game.isFamily, audienceIds: game.audienceIds },
        primaryKidId,
      );
      const age = calculateChildAge(kid?.birthdate ?? null) ?? undefined;

      const task: AgentTaskRequest = {
        kidId: primaryKidId,
        taskType: isUpdate ? "update_game" : "generate_game",
        gameId: game.id ?? undefined,
        childContext: {
          name: kid?.name ?? "",
          age,
          language: getLanguageDisplayName(kid?.language ?? "en"),
          locale: normalizeLocale(kid?.language),
          learningContext,
        },
        payload: payload as AgentTaskRequest["payload"],
      };

      const result = await runGameAgent({
        provider: gameCfg.provider,
        apiKey: gameCfg.apiKey,
        model: gameCfg.model,
        task,
        priorTurns: toPriorTurns(history),
        signal: controller.signal,
        onStep: (s) => {
          lastStep = s;
          setStep(s);
          recorder.onStep(s);
        },
        // Live activity: narration text streams into the line under the loader;
        // the write ticker counts streamed write_game_code input. Rounding to
        // 200-char steps keeps re-renders coarse (React skips equal states).
        onActivity: (e) => {
          recorder.onActivity(e);
          if (e.type === "narration_start") setNarration("");
          else if (e.type === "narration_delta") setNarration((n) => n + e.text);
          else if (
            e.type === "tool_started" &&
            (e.name === "write_game_code" || e.name === "edit_game_code")
          )
            setWriteChars(0);
          else if (e.type === "write_progress") setWriteChars(Math.floor(e.chars / 200) * 200);
        },
        // Narration is for the parent watching the studio — their UI language.
        narrationLanguage: getLanguageDisplayName(locale),
        onGenerateBackgroundImage: game.generateBackgroundImage ? makeBackgroundImage : undefined,
        // Independent of the generate toggle: "use my attached image as the
        // background" needs no image provider, just the bundle-size bound.
        onPrepareBackgroundImage: boundBackgroundImage,
        onGeneratePreviewImage: game.generatePreviewImage ? makePreviewImage : undefined,
        hasExistingPreviewImage: Boolean(game.previewImage),
        // Only when the setting resolves to a service now: with none, the model
        // never even sees the view_game tool.
        onViewGame: resolveScreenshotTarget() ? recorder.wrapViewGame(makeGameView) : undefined,
      });

      // Preview-only run: the parent asked for a new preview image and nothing
      // else changed — persist just the preview + transcript, leave the game
      // fields and version chain untouched.
      if (result.previewOnly && game.id) {
        if (!result.previewImage) {
          setPreviewNotice("failed");
          const withFail: ChatMessage[] = [
            ...withUser,
            { role: "assistant", text: t("previewUpdateFailedMessage"), ...finishRun("failed") },
          ];
          setMessages(withFail);
          void persistTranscript(withFail).catch(() => {
            /* best effort — the visible thread already has the reply */
          });
          return;
        }
        const preview = result.previewImage;
        const gameId = game.id;
        const withDodi: ChatMessage[] = [
          ...withUser,
          { role: "assistant", text: t("previewUpdatedMessage"), ...finishRun("completed") },
        ];
        setMessages(withDodi);
        setGame((g) => ({ ...g, previewImage: preview }));
        reportUsage({
          eventType: "game_edit",
          kidId: primaryKidId,
          gameId,
          provider: gameCfg.provider,
          model: gameCfg.model,
          usage: result.usage,
          meta: { turns: result.iterationCount },
        });
        try {
          const session = useVaultStore.getState().session;
          const sealed = await sealGameFields({ preview_image: preview });
          const res = await dodi.request(`/api/games/${gameId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              preview_image: sealed.preview_image,
              agent_transcript_enc: session
                ? session.encryptJson(sealableTranscript(withDodi))
                : null,
            }),
          });
          if (!res.ok) throw new Error(await readError(res));
          useGameStore.getState().patchLocal(gameId, { preview_image: preview });
          router.refresh();
        } catch (saveErr) {
          const reason = saveErr instanceof Error ? saveErr.message : "";
          setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
        }
        return;
      }

      // Swap the background placeholder for the real image BEFORE anything
      // renders or persists — the stored bundle stays self-contained.
      const finalCode = result.backgroundImage
        ? injectBackgroundImage(result.codeBundle, result.backgroundImage)
        : result.codeBundle;
      if (game.generateBackgroundImage && !result.backgroundImage) {
        setBgNotice(result.backgroundImageFailed ? "failed" : "skipped");
      }
      // A preview was expected but never landed. With an existing preview,
      // skipping the regeneration is a correct, deliberate choice — only a
      // failed attempt is worth a notice then.
      if (game.generatePreviewImage && !result.previewImage) {
        if (result.previewImageFailed) setPreviewNotice("failed");
        else if (!game.previewImage) setPreviewNotice("skipped");
      }
      if (result.visualCheckFailed && !screenshotUnavailableRef.current) {
        setVisualCheckNotice(true);
      }

      // Sanitize client-side before it touches state/persistence (the games route
      // sanitizes again server-side as defense-in-depth).
      const safeCode = sanitizeGameBundle(finalCode).code;

      // Mirrors the server's previous-version capture in updateCustomGame: a
      // non-empty pre-build bundle that differs from the result. Anchors the
      // Show changes | Revert links on this turn's reply.
      const codeChanged = Boolean(game.codeBundle) && safeCode !== game.codeBundle;

      // Record what this generation used (fire-and-forget). The tokens were spent
      // regardless of whether the persist below succeeds, so report it here. We
      // measure each context component's size (never its content) so we can track
      // how they evolve across users over time.
      const ctxSizes = measureLearningContext(
        kids,
        { isFamily: game.isFamily, audienceIds: game.audienceIds },
        primaryKidId,
      );
      const gp = payload as Partial<{
        prompt: string;
        instruction: string;
        learningGoal: string;
        successDefinition: string;
        tags: string[];
      }>;
      reportUsage({
        eventType: isUpdate ? "game_edit" : "game_create",
        kidId: primaryKidId,
        gameId: game.id ?? null,
        provider: gameCfg.provider,
        model: gameCfg.model,
        usage: result.usage,
        meta: {
          turns: result.iterationCount,
          validationRetries: result.validationRetries,
          outputChars: safeCode.length,
          memoryChars: ctxSizes.memoryChars,
          parentNotesChars: ctxSizes.parentNotesChars,
          learningGoalChars: (gp.learningGoal ?? "").length,
          successDefChars: (gp.successDefinition ?? "").length,
          promptChars: (gp.prompt ?? gp.instruction ?? "").length,
          tagsChars: (gp.tags ?? []).join(", ").length,
        },
      });

      // The summary contract is bullet lines only; the client owns the title
      // above the list (localized). Strip a model-authored heading line
      // (non-bullet first line ending in ":") so it never doubles up.
      const summary = (result.changeSummary ?? "")
        .trim()
        .replace(/^\s*[^-\n][^\n]*:\**\s*\n+/, "")
        .trim();
      const dodiText = summary
        ? `${t("buildSummaryTitle")}\n${summary}`
        : isUpdate
          ? `Updated **${result.title}** — the preview and code are refreshed.`
          : `Here's **${result.title}** — it's live in the preview; flip to Code to see what I wrote.`;
      const withDodi: ChatMessage[] = [
        ...withUser,
        {
          role: "assistant",
          text: dodiText,
          ...(codeChanged ? { hasCodeChange: true } : {}),
          ...finishRun(result.validationPassed ? "completed" : "validation_failed"),
        },
      ];

      const builtCapabilities = Array.isArray(result.metadata.capabilities)
        ? (result.metadata.capabilities as string[])
        : [];
      setGame((g) => ({
        ...g,
        built: true,
        title: result.title,
        tags: result.tags,
        description: result.description,
        learningGoal: result.learningGoal,
        successDefinition: result.successDefinition,
        progressKind: result.progressKind,
        // Keeps the next build in this session seeded with a fresh baseline.
        successCriteria: result.successCriteria,
        codeBundle: safeCode,
        markdown: result.markdown,
        capabilities: builtCapabilities,
      }));
      if (codeChanged) {
        setReverted(false);
        redoVersionRef.current = null;
      }
      setMessages(withDodi);
      setView("preview");

      // Persist the built game + the sealed transcript (no provider key involved).
      try {
        const row = await persistBuild(result, safeCode, withDodi);
        if (row) {
          // Adopt the server's new version head (an agent persist appends a
          // version) and the freshly persisted list preview, if any.
          setGame((g) => ({
            ...g,
            currentGameVersionId: row.current_game_version_id,
            previewImage: row.preview_image,
          }));
          void loadVersions();
        }
        if (adoptedIdRef.current) {
          // This studio adopted its id in place (planned draft → build) while
          // the router still points at /game-studio/new. Everything is
          // persisted now, so hand the route over to the game's own page.
          adoptedIdRef.current = false;
          router.replace(`/parent/game-studio/${game.id}/preview`);
        } else {
          router.refresh();
        }
      } catch (saveErr) {
        const reason = saveErr instanceof Error ? saveErr.message : "";
        setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
        reportErrorLog({
          context: "game_save",
          kidId: primaryKidId,
          gameId: game.id,
          provider: gameCfg.provider,
          model: gameCfg.model,
          ...describeError(saveErr, [gameCfg.apiKey]),
        });
      }
    } catch (err) {
      // Pressing Stop aborts the loop — don't dress that up as a failure.
      if (err instanceof AgentAbortedError || controller.signal.aborted) {
        const stopped = finishRun("stopped");
        setMessages((m) => [...m, { role: "assistant", text: t("stopped"), ...stopped }]);
      } else {
        // The user sees only the generic message (no server/provider errors
        // bubble up) — the real error goes to telemetry, where the meta below
        // separates a killed connection (offline/hidden tab) from a truncated
        // write (stopReason max_tokens) or a provider API error (httpStatus).
        console.error("[game-studio] build failed", err);
        const diag = err instanceof GameAgentError ? err.diagnostics : null;
        reportErrorLog({
          context: isUpdate ? "game_update" : "game_build",
          kidId: primaryKidId,
          gameId: game.id,
          provider: gameCfg?.provider,
          model: gameCfg?.model,
          ...describeError(err, gameCfg ? [gameCfg.apiKey] : []),
          meta: browserFailureMeta(startedAt, {
            lastStep: lastStep ?? undefined,
            ...(diag
              ? {
                  turns: diag.turns,
                  stopReason: diag.lastStopReason ?? undefined,
                  sawToolCalls: diag.sawToolCalls,
                  sawText: diag.sawText,
                }
              : {}),
          }),
        });
        setError(t("buildFailed"));
        const failed = finishRun("failed");
        setMessages((m) => [...m, { role: "assistant", text: t("buildFailed"), ...failed }]);
      }
    } finally {
      setThinking(false);
      setStep(null);
      setNarration("");
      setWriteChars(0);
      setLiveRun(null);
      abortRef.current = null;
    }
  }

  async function saveSettings(): Promise<void> {
    if (saving) return;
    // Mandatory fields: a title (brand-new games only), a learning goal, and a
    // child/audience. Empty ones are flagged red instead of showing a message.
    // (Server schemas stay permissive so voice/system game creation, which has
    // no parent goal, still works.)
    const nextInvalid = {
      title: isPlanning && !game.title.trim(),
      learningGoal: !game.learningGoal.trim(),
      audience: !primaryKidId,
      age: !isValidAgeRange(game.targetAgeMin, game.targetAgeMax),
    };
    if (nextInvalid.title || nextInvalid.learningGoal || nextInvalid.audience || nextInvalid.age) {
      setInvalid(nextInvalid);
      setView("settings");
      return;
    }
    setInvalid({});
    setError(null);
    setSaving(true);
    try {
      // Let a planning write in flight land first (it may be the very create
      // that mints the id), and never queue another: this save ends planning.
      planningDirtyRef.current = false;
      await planningInflightRef.current;
      const gameId = gameIdRef.current;
      if (gameId) {
        // Map the success definition to structured criteria IN THE BROWSER (the
        // provider key stays in the vault); send only the mapped result. With no
        // provider configured (or on a mapping error) we persist the text and
        // leave the existing criteria untouched.
        let mappedCriteria: { success_criteria: unknown; progress_kind: ProgressKind } | null = null;
        try {
          const gameCfg = await resolveClientGame();
          const mapped = await mapSuccessDefinition(
            gameCfg
              ? { providerId: gameCfg.provider, modelId: gameCfg.model, apiKey: gameCfg.apiKey }
              : null,
            game.successDefinition,
            { learningGoal: game.learningGoal },
          );
          mappedCriteria = {
            success_criteria: mapped.successCriteria,
            progress_kind: mapped.progressKind,
          };
        } catch {
          /* no provider / mapping failed — persist the text, keep criteria as-is */
        }
        if (mappedCriteria) setField("progressKind", mappedCriteria.progress_kind);
        const sealed = await sealGameFields({
          title: game.title || undefined,
          learning_goal: game.learningGoal,
          success_definition: game.successDefinition,
          ...(mappedCriteria
            ? { success_criteria: mappedCriteria.success_criteria as Json }
            : {}),
        });
        const res = await dodi.request(`/api/games/${gameId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...sealed,
            tags: game.tags,
            target_age_min: game.targetAgeMin,
            target_age_max: game.targetAgeMax,
            ...(mappedCriteria
              ? { progress_kind: mappedCriteria.progress_kind }
              : {}),
            is_active: game.isActive,
            // Shallow-merged server-side, so capabilities/drawingStyle survive.
            metadata: {
              perspective: game.perspective,
              generateBackgroundImage: game.generateBackgroundImage,
              generatePreviewImage: game.generatePreviewImage,
            },
            audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
            // Saving the settings ends planning: the envelope goes, the row
            // becomes a plain draft (or, with an accepted plan, a build).
            ...(isPlanning ? { plan_enc: null } : {}),
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
        useGameStore
          .getState()
          .put(await decryptGameResponse((await res.json()) as Game));

        if (isPlanning) {
          // Nothing left to persist from the Plan step; drop a queued write so
          // it cannot resurrect the envelope after this save.
          planningDirtyRef.current = false;
          setIsPlanning(false);
          if (acceptedPlan) {
            // A plan was agreed, so this save IS the start of the build (the
            // effect below starts it once the chat is unlocked).
            pendingAutoBuildRef.current = {
              text: `${t("planBuildIntro")}\n\n${acceptedPlan}`,
              images: planImage ? [planImage] : [],
            };
            setViewState("preview");
            window.history.replaceState(null, "", studioUrl(gameId, "preview"));
            if (vertical) setMtab("chat");
            return;
          }
          if (adoptedIdRef.current) {
            // The row was created by the first plan turn while the router
            // still points at /game-studio/new. Everything is persisted now,
            // so hand the route over to the game's own page (which is where
            // an unplanned draft's save always landed).
            adoptedIdRef.current = false;
            router.replace(studioUrl(gameId, "preview"));
            return;
          }
        }
      } else {
        // Persist a new game straight from settings (no build required). With no
        // code yet we seal the placeholder ourselves — the server can't write
        // plaintext into an encrypted column, and only we can read the marker
        // back to tell "unbuilt" from a real game.
        const sealed = await sealGameCreateFields({
          title: game.title.trim(),
          learningGoal: game.learningGoal || undefined,
          successDefinition: game.successDefinition || undefined,
          codeBundle: game.codeBundle || UNBUILT_GAME_PLACEHOLDER,
        });
        // The Plan conversation is already worth keeping: seal it onto the new
        // row so a reload shows what was discussed, not an empty thread.
        const session = useVaultStore.getState().session;
        const planTranscript =
          messages.length > 0 && session
            ? session.encryptJson(sealableTranscript(messages))
            : null;
        const res = await dodi.request("/api/games", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kidId: primaryKidId,
            ...sealed,
            tags: game.tags,
            targetAgeMin: game.targetAgeMin,
            targetAgeMax: game.targetAgeMax,
            progressKind: game.successDefinition.trim() ? "goal" : "open",
            // Playable only once real code exists; an unbuilt draft is not.
            isActive: Boolean(game.codeBundle),
            metadata: {
              perspective: game.perspective,
              generateBackgroundImage: game.generateBackgroundImage,
              generatePreviewImage: game.generatePreviewImage,
            },
            audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
            ...(planTranscript ? { agentTranscriptEnc: planTranscript } : {}),
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { id: string };
        useGameStore.getState().invalidate();
        setIsPlanning(false);

        if (acceptedPlan) {
          // A plan was agreed, so this save IS the start of the build. Adopt the
          // new id in place instead of navigating: a router push would remount
          // the studio and take the plan thread, the sketch and the queued build
          // with it. The URL is corrected here, and the route is handed over to
          // the game's own page once the build has persisted (see send()).
          pendingAutoBuildRef.current = {
            text: `${t("planBuildIntro")}\n\n${acceptedPlan}`,
            images: planImage ? [planImage] : [],
          };
          adoptedIdRef.current = true;
          gameIdRef.current = data.id;
          setGame((g) => ({ ...g, id: data.id }));
          setViewState("preview");
          window.history.replaceState(null, "", `/parent/game-studio/${data.id}/preview`);
          if (vertical) setMtab("chat");
          return;
        }

        // Move to the draft's own URL so the build binds to this id and
        // reload/recovery works. The chat unlocks on the [id] route.
        router.push(`/parent/game-studio/${data.id}`);
        return;
      }
      setJustSaved(true);
      router.refresh();
      setTimeout(() => setJustSaved(false), 2200);
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
    } finally {
      setSaving(false);
    }
  }

  // Start the build queued by an accepted plan, once the id is live and the
  // chat is unlocked. Deliberately an effect and not a call inside
  // saveSettings: send() reads game.id and the lock from its closure, which
  // are still the pre-save values in the render that saved.
  useEffect(() => {
    const pending = pendingAutoBuildRef.current;
    if (!pending || !game.id || isPlanning) return;
    pendingAutoBuildRef.current = null;
    void send(pending.text, { images: pending.images, isAgreedPlan: true });
    // Fires exactly once per save; send() is stable enough for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, isPlanning]);

  // Flip the game's active state straight from the studio header — an optimistic
  // auto-save so parents can activate/deactivate without opening settings. The
  // switch reverts if the PATCH fails.
  async function toggleActive(): Promise<void> {
    if (!game.id || togglingActive) return;
    const next = !game.isActive;
    const gameId = game.id;
    setField("isActive", next);
    // The kid library reads is_active from the same cache, so flip it there too.
    useGameStore.getState().patchLocal(gameId, { is_active: next });
    setTogglingActive(true);
    setError(null);
    try {
      const res = await dodi.request(`/api/games/${gameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) throw new Error(await readError(res));
      router.refresh();
    } catch (e) {
      setField("isActive", !next); // revert the optimistic flip
      useGameStore.getState().patchLocal(gameId, { is_active: !next });
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("saveFailed", { reason }) : t("saveFailedGeneric"));
    } finally {
      setTogglingActive(false);
    }
  }

  const starters = [
    t("starterCounting"),
    t("starterMath"),
    t("starterStory"),
    t("starterDrawing"),
  ];

  // In the Plan step dodi is a brainstorming partner, not a builder — the
  // progress steps belong to a build and never fire here.
  const statusText = isPlanMode
    ? thinking
      ? t("planThinking")
      : t("plannerRole")
    : thinking
      ? step
        ? stepLabel(step)
        : t("working")
      : t("designerRole");

  // The turn links attach only to the LAST code-changing reply — the stored
  // previous version corresponds to exactly that change.
  const lastChangeIndex = messages.reduce(
    (last, m, i) => (m.hasCodeChange ? i : last),
    -1,
  );

  // The Plan step's surfaces are the same on every layout; only where they
  // render differs (the stage side by side, the chat pane on a phone).
  const renderPlanSurface = (): React.ReactNode => {
    if (planSurface === "sketch") {
      return (
        <PlanSketchSurface
          strokes={sketchStrokes}
          onStrokesChange={setSketchStrokes}
          onChange={onSketchChange}
          onAttach={attachSketch}
          onBack={() => setPlanSurface("chat")}
          isBusy={thinking}
          t={t}
        />
      );
    }
    if (planSurface === "plan") {
      return (
        <PlanSurface
          onBack={() => setPlanSurface("chat")}
          planDraft={planDraft}
          isEditingPlan={isEditingPlan}
          onPlanDraftChange={setPlanDraft}
          onToggleEdit={() => setIsEditingPlan((v) => !v)}
          onAccept={() => void acceptPlan()}
          onSkip={skipPlan}
          onPersonalize={() => void sendPlanMessage(t("planChipPersonalize"))}
          isBusy={thinking}
          isDerivingSettings={isDerivingSettings}
          t={t}
        />
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-x-0 top-[60px] bottom-0 z-30 flex flex-col border-t border-border bg-background wide:top-[72px] wide:left-56"
      data-screen-label={editing ? "Parent — Edit game" : "Parent — New game"}
    >
      {/* Mobile tab bar (vertical layout only; hidden while the Dodi pane is
          gated away — a draft past the Plan step and before its first save —
          and during the Plan step, which owns the whole screen). */}
      {panes.showTabBar && (
        <div className="flex flex-shrink-0 gap-1 border-b border-border bg-card px-3 py-2">
          <StudioTab
            active={mtab === "game"}
            onClick={() => setMtab("game")}
            icon="show"
            label={t("tabGame")}
          />
          <StudioTab
            active={mtab === "chat"}
            onClick={() => setMtab("chat")}
            icon="sparkles"
            label={t("tabDodi")}
          />
        </div>
      )}

      {/* Two-pane: main stage + chat sidebar */}
      <div
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden",
          vertical ? "flex-col" : "flex-row",
        )}
      >
        {/* Main stage */}
        <div
          className={cn(
            // min-w-0: let a wide Code view scroll inside the pane instead of
            // widening it and squeezing the Dodi sidebar.
            "flex min-h-0 min-w-0 flex-1 flex-col bg-background",
            !panes.showMain && "hidden",
          )}
        >
          <div
            className={cn(
              "flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 md:px-5",
              // The Plan step's surfaces bring their own header; the stage
              // switch returns once the plan is accepted or skipped.
              isPlanMode && "hidden",
            )}
          >
            {/* One switch for the whole stage — Preview / Code / Settings (the
                settings gear folded in as a tab), plus Plan while the game is
                still a draft. */}
            <div className="inline-flex gap-0.5 rounded-[10px] border border-border bg-background p-[3px]">
              {isPlanning && (
                <SegTab active={view === "plan"} onClick={() => setView("plan")} icon="pencil" label={t("plan")} />
              )}
              <SegTab active={view === "settings"} onClick={() => setView("settings")} icon="settings" label={t("settings")} />
              <SegTab active={view === "code"} onClick={() => setView("code")} icon="code" label={t("code")} />
              <SegTab active={view === "preview"} onClick={() => setView("preview")} icon="show" label={t("preview")} />
            </div>
            {view === "preview" && previewHasTranslations && (
              <div
                role="group"
                aria-label={t("previewLanguage")}
                className="inline-flex gap-0.5 rounded-[10px] border border-border bg-background p-[3px]"
              >
                {locales.map((code) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={previewLocale === code}
                    onClick={() => setPreviewLocaleChoice(code)}
                    className={cn(
                      "rounded-[8px] px-2 py-1 text-[11px] font-semibold uppercase transition-colors",
                      previewLocale === code
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {code}
                  </button>
                ))}
              </div>
            )}
            {/* Audience + active state only exist once the game is created. */}
            {game.id && (
              <div className="flex items-center gap-2.5">
                {(game.isFamily || selectedKids.length > 0) && (
                  <div className="hidden items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground sm:flex">
                    <span>{t("forLabel")}</span>
                    {game.isFamily ? (
                      <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {t("family")}
                      </span>
                    ) : (
                      <span className="flex items-center -space-x-1.5">
                        {selectedKids.slice(0, 3).map((k) => (
                          <span
                            key={k.id}
                            className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-card bg-primary-soft text-[11px] font-bold text-primary"
                            title={k.name}
                          >
                            {k.name.charAt(0).toUpperCase()}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )}
                {/* Status is an auto-saving switch — flip active/inactive without
                    opening settings. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={game.isActive}
                  aria-label={t("visibilityLabel")}
                  title={t("activeHint")}
                  onClick={() => void toggleActive()}
                  disabled={togglingActive}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    game.isActive
                      ? "border-primary-soft-2 bg-primary-soft text-primary"
                      : "border-border-strong bg-card text-muted-foreground hover:border-faint",
                  )}
                >
                  <span
                    className={cn(
                      "relative inline-flex h-4 w-[27px] shrink-0 items-center rounded-full transition-colors",
                      game.isActive ? "bg-primary" : "bg-border-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                        game.isActive ? "translate-x-[13px]" : "translate-x-[2px]",
                      )}
                    />
                  </span>
                  {game.isActive ? t("active") : t("inactive")}
                </button>
              </div>
            )}
          </div>

          <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
            {/* The stage stays mounted whenever code exists (hidden by CSS on the
                other tabs) so the sandbox can serve edit-time screenshot capture
                without a reload — hiding instead of unmounting keeps layout alive
                for the DOM rasterizer. In the vertical layout's chat tab the whole
                pane is display:none; capture degrades there (canvas still works,
                DOM rasterization may return null → text-only edit). */}
            {game.codeBundle && (
              <div
                aria-hidden={view !== "preview" || undefined}
                className={cn(
                  "flex min-h-full items-center justify-center p-5 md:p-8",
                  view !== "preview" &&
                    "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden",
                )}
              >
                <GameStage
                  // Locale is fixed at init — remount on switch so the game
                  // re-renders its text in the newly picked language.
                  key={previewLocale}
                  gameId={game.id ?? "preview"}
                  codeBundle={game.codeBundle}
                  locale={previewLocale}
                  reserved={STAGE.reservedStudio}
                  sandboxRef={sandboxRef}
                />
              </div>
            )}
            {view === "preview" && !game.codeBundle && (
              <div className="flex min-h-full items-center justify-center p-5 md:p-8">
                <EmptyStage title={t("previewEmpty")} />
              </div>
            )}
            {view === "code" &&
              (game.codeBundle ? (
                <CodeViewer
                  code={game.codeBundle}
                  previousCode={previousCode}
                  showChanges={showChanges}
                  onShowChangesChange={setShowChanges}
                  versions={versionOptions}
                  currentVersionId={game.currentGameVersionId}
                  onSelectVersion={selectVersion}
                  busy={thinking || reverting}
                  onSaveEdit={game.id ? handleSaveEdit : undefined}
                  copyLabel={t("copy")}
                  copiedLabel={t("copied")}
                  showChangesLabel={t("showChanges")}
                  showChangesUnavailableTitle={t("noPreviousVersion")}
                  unchangedLabel={(count) => t("unchangedLines", { count })}
                  editLabel={t("editCode")}
                  editSaveLabel={t("editCodeSave")}
                  editCancelLabel={t("editCodeCancel")}
                  versionSelectorLabel={t("versionSelector")}
                  searchPhrases={searchPhrases}
                />
              ) : (
                <div className="flex min-h-full items-center justify-center p-8">
                  <EmptyStage title={t("codeEmpty")} icon="code" />
                </div>
              ))}
            {/* Side by side, a plan surface takes the stage (on a phone it
                renders inside the chat pane instead, see below). */}
            {isPlanMode && !vertical && planSurface !== "chat" && (
              <div className="absolute inset-0 flex flex-col">{renderPlanSurface()}</div>
            )}
            {view === "settings" && (
              <SettingsForm
                game={game}
                kids={kids}
                invalid={invalid}
                setField={setField}
                selectFamily={selectFamily}
                toggleKid={toggleKid}
                onSave={saveSettings}
                saving={saving}
                justSaved={justSaved}
                error={error}
                hasImageProvider={hasImageProvider}
                isPlanning={isPlanning}
                hasAcceptedPlan={Boolean(acceptedPlan)}
                t={t}
              />
            )}
          </div>
        </div>

        {/* Chat sidebar — the right menu stays hidden for a brand-new game
            until the draft is saved (which mints the game id and unlocks the
            studio); the settings form fills the pane on its own until then.
            Drop zone for reference images (same path as paste / file picker). */}
        <div
          style={vertical || chatFullscreen ? undefined : { width: sideWidth }}
          className={cn(
            "relative flex min-h-0 flex-col border-border bg-card",
            !panes.showChat && "hidden",
            vertical || chatFullscreen ? "w-full flex-1" : "flex-none border-l",
          )}
          onDragEnter={onInboxDragEnter}
          onDragLeave={onInboxDragLeave}
          onDragOver={onInboxDragOver}
          onDrop={onInboxDrop}
        >
          {/* Drop overlay — visible while files are dragged over the inbox. */}
          {isDragOver && !composerLocked && (
            <div
              className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-primary-soft/90 px-6 text-center backdrop-blur-[2px]"
              aria-hidden
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-card/80 text-primary">
                <Icon name="photo" size={28} />
              </div>
              <p className="text-sm font-semibold text-primary">{t("dropImages")}</p>
              <p className="text-xs font-medium text-primary/80">
                {pendingImages.length >= MAX_ATTACHMENTS
                  ? t("attachLimitReached")
                  : t("dropImagesHint")}
              </p>
            </div>
          )}
          {/* Resize handle (horizontal layout only, and only as a sidebar) */}
          {!vertical && !chatFullscreen && (
            <div
              onMouseDown={startSideResize}
              className="group absolute -left-1 bottom-0 top-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center"
              title="Drag to resize"
            >
              <span className="h-7 w-0.5 rounded bg-border-strong transition-all group-hover:h-11 group-hover:bg-primary" />
            </div>
          )}

          {/* Header */}
          <div
            className={cn(
              "flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-3",
              mobileSurfaceOpen && "hidden",
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft p-0.5">
              <Image
                src="/images/dodi-head-active.png"
                alt=""
                width={36}
                height={36}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-ink">{t("designerName")}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "inline-block h-[7px] w-[7px] rounded-full",
                    thinking ? "animate-pulse bg-primary" : "bg-success",
                  )}
                />
                <span className="truncate">{statusText}</span>
              </div>
            </div>
            {/* Clear the conversation history (also available by typing /clear). */}
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              disabled={thinking || messages.length === 0}
              title={t("clearHistory")}
              aria-label={t("clearHistory")}
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              <Icon name="delete" size={16} />
            </button>
          </div>

          {/* The Plan step's own controls, pinned under the header so they stay
              reachable while the thread scrolls. On a phone an open surface has
              its own header instead. */}
          {isPlanMode && !mobileSurfaceOpen && messages.length > 0 && (
            <PlanActionRow
              hasPlan={hasPlan}
              activeSurface={planSurface}
              compact={vertical}
              onDrawSketch={openSketchSurface}
              onTakePhoto={openPlanCamera}
              onOpenPlan={() => setPlanSurface("plan")}
              onSkip={skipPlan}
              isBusy={thinking}
              isDerivingSettings={isDerivingSettings}
              needsGameProvider={needsGameProvider}
              t={t}
            />
          )}

          {/* The camera, reachable from the chat pane. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (isPlanMode) void onPhotoPicked(file);
              else void addImages([file]);
            }}
          />

          {/* On a phone a plan surface takes the thread's place. The thread is
              hidden, not unmounted, so it comes back where the parent left it. */}
          {mobileSurfaceOpen && renderPlanSurface()}

          {/* Thread */}
          <div
            ref={threadRef}
            className={cn("min-h-0 flex-1 overflow-y-auto", mobileSurfaceOpen && "hidden")}
          >
            <div
              className={cn(
                "flex flex-col gap-[18px] px-[18px] pb-1.5 pt-[18px]",
                chatFullscreen && "mx-auto w-full max-w-[640px]",
              )}
            >
              {messages.length === 0 ? (
                <div
                  className={cn(
                    "flex flex-col items-center px-1 text-center",
                    // The phone's Plan step needs the height for its actions.
                    isMobilePlan ? "pb-2 pt-3" : "pb-2 pt-6",
                  )}
                >
                  {!isMobilePlan && (
                    <Image
                      src="/images/dodi-active.png"
                      alt=""
                      width={56}
                      height={56}
                      className="mb-3 h-14 w-14 object-contain"
                    />
                  )}
                  <h2 className="text-[18px] font-bold tracking-tight text-ink">
                    {t(isPlanMode ? "planWelcomeTitle" : "welcomeTitle")}
                  </h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {t(isPlanMode ? "planWelcomeDesc" : "welcomeDesc")}
                  </p>
                  {isPlanMode ? (
                    <PlanEmptyActions
                      hasPlan={hasPlan}
                      onIdea={() => void send(t("planStarterIdea"))}
                      onDrawSketch={openSketchSurface}
                      onTakePhoto={openPlanCamera}
                      onOpenPlan={() => setPlanSurface("plan")}
                      onSkip={skipPlan}
                      isBusy={thinking}
                      isDerivingSettings={isDerivingSettings}
                      needsGameProvider={needsGameProvider}
                      t={t}
                    />
                  ) : (
                    !needsGameProvider && (
                      <div className="mt-[18px] flex w-full flex-col gap-2">
                        {starters.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void send(s)}
                            className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-[11px] text-left text-[13.5px] font-medium text-ink-2 transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
                          >
                            <Icon name="sparkles" size={14} className="shrink-0 text-primary" />
                            {s}
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              ) : (
                messages.map((m, i) =>
                  m.role === "assistant" ? (
                    <div key={i} className="flex items-start gap-3">
                      <Image
                        src="/images/dodi-head-active.png"
                        alt=""
                        width={30}
                        height={30}
                        className="-mt-px h-[30px] w-[30px] shrink-0 object-contain"
                      />
                      <div className="min-w-0 flex-1 text-sm leading-[1.6] text-ink">
                        <RichText text={m.text} />
                        {m.run && <AgentRunHistory run={m.run} />}
                        {i === lastChangeIndex && (canDiff || reverted) && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-faint">
                            <button
                              type="button"
                              onClick={openChanges}
                              className="underline-offset-2 transition-colors hover:text-primary hover:underline"
                            >
                              {t("showChanges")}
                            </button>
                            <span aria-hidden>|</span>
                            <button
                              type="button"
                              onClick={() => void revertCode()}
                              disabled={reverting || thinking}
                              className="underline-offset-2 transition-colors hover:text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-faint disabled:hover:no-underline"
                            >
                              {reverted ? t("restoreVersion") : t("revertVersion")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[88%] rounded-2xl rounded-tr-[5px] bg-primary-soft px-3.5 py-2.5 text-sm font-medium leading-[1.6] text-ink">
                        {m.images && m.images.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {m.images.map((img, j) => (
                              // Raw <img>: attachments are data URLs (next/image can't optimize them).
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={j}
                                src={img}
                                alt=""
                                className="h-16 w-16 rounded-lg border border-border object-cover"
                              />
                            ))}
                          </div>
                        )}
                        <RichText text={m.text} />
                      </div>
                    </div>
                  ),
                )
              )}
              {thinking && (
                <div className="flex items-start gap-3">
                  <Image
                    src="/images/dodi-head-active.png"
                    alt=""
                    width={30}
                    height={30}
                    className="-mt-px h-[30px] w-[30px] shrink-0 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex gap-1.5 py-1.5">
                      <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-faint [animation-delay:0ms]" />
                      <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-faint [animation-delay:150ms]" />
                      <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-faint [animation-delay:300ms]" />
                    </div>
                    {liveRun && <AgentRunTimeline run={liveRun} isLive />}
                    {/* No aria-live: announcing every streamed delta would spam
                        screen readers — the header status line carries progress. */}
                    {narration.trim() && (
                      <p className="mt-1 whitespace-pre-wrap text-[12.5px] italic leading-relaxed text-muted-foreground">
                        {narration.trim()}
                      </p>
                    )}
                    {step === "writing_code" && writeChars > 0 && (
                      <p className="mt-1 text-[11.5px] font-medium tabular-nums text-faint">
                        {t("writeProgress", { chars: writeChars })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div
            ref={composerRef}
            className={cn(
              "flex-shrink-0 px-4 pb-3.5 pt-2",
              chatFullscreen && "mx-auto w-full max-w-[640px]",
            )}
          >
            {needsGameProvider && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning">
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>
                  {t("needThinkingProvider")}{" "}
                  <Link
                    href="/parent/settings/ai-providers"
                    className="font-semibold underline underline-offset-2 hover:opacity-80"
                  >
                    {t("openSettings")}
                  </Link>
                </span>
              </div>
            )}
            {thinking && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary">
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>{t("agentRunningWarning")}</span>
              </div>
            )}
            {error && (
              <div className="mb-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs font-medium text-danger">
                {error}
              </div>
            )}
            {bgNotice && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning">
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>{t(bgNotice === "failed" ? "bgFailedNotice" : "bgSkippedNotice")}</span>
              </div>
            )}
            {previewNotice && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning">
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>
                  {t(previewNotice === "failed" ? "previewFailedNotice" : "previewSkippedNotice")}
                </span>
              </div>
            )}
            {visualCheckNotice && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning">
                <Icon name="alert" size={14} className="mt-px shrink-0" />
                <span>{t("visualCheckFailedNotice")}</span>
              </div>
            )}
            <div className="relative rounded-2xl border border-border-strong bg-card px-4 pb-2.5 pt-3 shadow-[0_4px_18px_rgba(34,56,78,0.07)] transition-colors focus-within:border-primary">
              {/* Composer top resize handle (horizontal layout only) */}
              {!vertical && (
                <div
                  onMouseDown={startComposerResize}
                  className="group absolute -top-1.5 left-0 right-0 z-10 flex h-3 cursor-ns-resize items-center justify-center"
                  title="Drag to resize"
                >
                  <span className="h-[3px] w-8 rounded bg-border-strong transition-all group-hover:w-12 group-hover:bg-primary" />
                </div>
              )}
              {pendingImages.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingImages.map((img, i) => (
                    <div key={i} className="relative">
                      {/* Raw <img>: staged attachments are data URLs. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img}
                        alt=""
                        className="h-12 w-12 rounded-lg border border-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPendingImages((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label={t("removeImage")}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-danger"
                      >
                        <Icon name="close" size={11} strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                style={{
                  height: !mobileSurfaceOpen
                    ? composerHeight
                    : draft.trim()
                      ? Math.min(composerHeight, COMPOSER_SURFACE_MAX)
                      : COMPOSER_ONE_LINE,
                }}
                disabled={composerLocked}
                className="block w-full resize-none border-0 bg-transparent p-0 pb-1.5 text-[14.5px] leading-normal text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
                placeholder={
                  needsGameProvider
                    ? t("composerPlaceholderNoThinking")
                    : isPlanMode
                      ? t("planComposerPlaceholder")
                      : messages.length === 0
                        ? t("composerPlaceholderEmpty")
                        : t("composerPlaceholder")
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.items)
                    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                    .map((item) => item.getAsFile())
                    .filter((f): f is File => f !== null);
                  if (files.length) {
                    e.preventDefault();
                    void addImages(files);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    // Slash-command: "/clear" wipes the conversation (with confirm).
                    if (draft.trim() === "/clear") {
                      setDraft("");
                      setClearOpen(true);
                      return;
                    }
                    void send();
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length) void addImages(files);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setAttachSheetOpen(true)}
                  disabled={composerLocked || pendingImages.length >= MAX_ATTACHMENTS}
                  aria-label={t("attachImage")}
                  title={
                    pendingImages.length >= MAX_ATTACHMENTS
                      ? t("attachLimitReached")
                      : t("attachImage")
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="photo" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => (thinking ? stop() : void send())}
                  disabled={composerLocked || (thinking ? false : !draft.trim())}
                  aria-label={thinking ? t("stop") : t("send")}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors active:scale-95",
                    (thinking ? true : draft.trim() && !composerLocked)
                      ? "bg-primary hover:bg-primary-hover"
                      : "bg-border-strong",
                  )}
                >
                  <Icon name={thinking ? "stop" : "send"} size={17} />
                </button>
              </div>
            </div>
            <p
              className={cn(
                "mt-2 text-center text-[11px] leading-snug text-faint",
                mobileSurfaceOpen && "hidden",
              )}
            >
              {t("footer")}
            </p>
          </div>
        </div>
      </div>

      {/* The composer's image button: camera, file, or (while planning) a sketch. */}
      <ReferenceImageSheet
        open={attachSheetOpen}
        onOpenChange={setAttachSheetOpen}
        anchorRef={composerRef}
        onTakePhoto={openCamera}
        onUpload={() => fileInputRef.current?.click()}
        onDraw={isPlanMode ? openSketchSurface : undefined}
        t={t}
      />

      {/* Manual code-edit save — offers to snapshot the change as a new
          version (default on); declining overwrites the current head. */}
      <Dialog
        open={saveEditOpen}
        onOpenChange={(open) => {
          if (!open && !savingEdit) settleSaveEdit(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveEditTitle")}</DialogTitle>
            <DialogDescription>{t("saveEditDescription")}</DialogDescription>
          </DialogHeader>
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2">
            <Switch checked={saveAsNewVersion} onCheckedChange={setSaveAsNewVersion} />
            {t("saveEditNewVersion")}
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingEdit}
              onClick={() => settleSaveEdit(false)}
            >
              {t("saveEditCancel")}
            </Button>
            <Button disabled={savingEdit} onClick={() => void confirmSaveEdit()}>
              {t("saveEditConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destructive confirm for clearing the conversation history. */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clearHistoryConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("clearHistoryConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              {t("clearHistoryCancel")}
            </Button>
            <Button variant="destructive" onClick={clearHistory}>
              {t("clearHistoryConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function SegTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[13px] font-semibold transition-colors",
        active
          ? "bg-card text-ink shadow-[0_1px_2px_rgba(34,56,78,0.06)]"
          : "text-muted-foreground hover:text-ink-2",
      )}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

/** Full-width Game/Dodi switch shown above the panes in the vertical layout. */
function StudioTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border px-2.5 py-2 text-[13.5px] font-semibold transition-colors",
        active
          ? "border-primary-soft-2 bg-primary-soft text-primary"
          : "border-border bg-background text-muted-foreground",
      )}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

function EmptyStage({ title, icon = "games" }: { title: string; icon?: "games" | "code" }) {
  return (
    <div className="m-auto max-w-[280px] text-center">
      <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card text-faint">
        <Icon name={icon} size={28} />
      </div>
      <div className="text-[13px] leading-relaxed text-muted-foreground">{title}</div>
    </div>
  );
}

function AudienceButton({
  selected,
  onClick,
  label,
  icon,
  initial,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  icon?: IconName;
  initial?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
        selected
          ? "border-primary bg-primary-soft text-primary"
          : "border-border-strong bg-card text-ink-2 hover:border-faint",
      )}
    >
      {icon ? (
        <Icon name={icon} size={16} className={selected ? "text-primary" : "text-muted-foreground"} />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
          {initial}
        </span>
      )}
      {label}
      {selected && <Icon name="check" size={14} strokeWidth={3} />}
    </button>
  );
}

function SettingsForm({
  game,
  kids,
  invalid,
  setField,
  selectFamily,
  toggleKid,
  onSave,
  saving,
  justSaved,
  error,
  hasImageProvider,
  isPlanning,
  hasAcceptedPlan,
  t,
}: {
  game: StudioGame;
  kids: KidOption[];
  invalid: { title?: boolean; learningGoal?: boolean; audience?: boolean; age?: boolean };
  setField: <K extends keyof StudioGame>(key: K, value: StudioGame[K]) => void;
  selectFamily: () => void;
  toggleKid: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  justSaved: boolean;
  error: string | null;
  /** Image model configured + key available (null = still loading). */
  hasImageProvider: boolean | null;
  /** Still in the Plan step: this save is the first, mandatory one. */
  isPlanning: boolean;
  /** A plan was agreed in the Plan step — saving starts the build right away. */
  hasAcceptedPlan: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  // Only the game-studio catalog is offered; non-catalog tags are stripped on save.
  const tagLabel = useTagLabel();
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-4 p-5 md:p-8">
      <Field label={t("gameName")} required>
        <Input
          value={game.title}
          placeholder={t("gameNamePlaceholder")}
          aria-invalid={invalid.title || undefined}
          aria-required
          onChange={(e) => setField("title", e.target.value)}
        />
      </Field>

      <Field label={t("forKid")} required>
        <div
          className={cn(
            "flex flex-wrap gap-2",
            invalid.audience &&
              "-m-2 rounded-lg border border-destructive p-2 ring-2 ring-destructive/20",
          )}
        >
          <AudienceButton
            selected={game.isFamily}
            onClick={selectFamily}
            icon="friends"
            label={t("family")}
          />
          {kids.map((k) => (
            <AudienceButton
              key={k.id}
              selected={!game.isFamily && game.audienceIds.includes(k.id)}
              onClick={() => toggleKid(k.id)}
              initial={k.name.charAt(0).toUpperCase()}
              label={k.name}
            />
          ))}
        </div>
      </Field>

      {/* Active/inactive lives in the studio header now (an auto-saving switch),
          so the settings form no longer duplicates it. */}

      <Field label={t("learningGoal")} required>
        <textarea
          className="min-h-[76px] w-full resize-y rounded-md border border-border-strong bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
          value={game.learningGoal}
          placeholder={t("learningGoalPlaceholder")}
          aria-invalid={invalid.learningGoal || undefined}
          aria-required
          onChange={(e) => setField("learningGoal", e.target.value)}
        />
      </Field>

      <Field
        label={t("successDefinition")}
        hint={game.successDefinition ? t("progressKindGoal") : t("progressKindOpen")}
      >
        <textarea
          className="min-h-[72px] w-full resize-y rounded-md border border-border-strong bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2"
          value={game.successDefinition}
          placeholder={t("successPlaceholder")}
          onChange={(e) => setField("successDefinition", e.target.value)}
        />
      </Field>

      <Field label={t("tags")} hint={t("tagsHint")}>
        <div className="flex flex-wrap gap-2">
          {GAME_TAGS.map((tag) => {
            const selected = game.tags.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  setField(
                    "tags",
                    selected
                      ? game.tags.filter((x) => x !== tag.id)
                      : [...game.tags, tag.id],
                  )
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border-strong bg-card text-ink-2 hover:border-faint",
                )}
              >
                <Icon name={tagStyle(tag.id).icon} size={15} />
                {tagLabel(tag.id)}
                {selected && <Icon name="check" size={13} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label={t("recommendedAge")}
        hint={invalid.age ? undefined : t("recommendedAgeHint")}
      >
        <AgeRange
          min={game.targetAgeMin}
          max={game.targetAgeMax}
          onMinChange={(v) => setField("targetAgeMin", v)}
          onMaxChange={(v) => setField("targetAgeMax", v)}
          minLabel={t("ageMinLabel")}
          maxLabel={t("ageMaxLabel")}
        />
        {invalid.age && (
          <p className="text-[11px] font-medium text-danger">{t("ageRangeInvalid")}</p>
        )}
      </Field>

      <Field label={t("perspectiveLabel")} hint={t("perspectiveHint")}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("perspectiveLabel")}>
          {(
            [
              [null, t("perspectiveUnspecified")],
              ["bird", t("perspectiveBird")],
              ["side", t("perspectiveSide")],
              ["isometric", t("perspectiveIsometric")],
            ] as Array<[GamePerspective | null, string]>
          ).map(([value, label]) => {
            const selected = game.perspective === value;
            return (
              <button
                key={value ?? "unspecified"}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setField("perspective", value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border-strong bg-card text-ink-2 hover:border-faint",
                )}
              >
                {label}
                {selected && <Icon name="check" size={13} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label={t("backgroundImageLabel")}
        hint={hasImageProvider === false ? undefined : t("backgroundImageHint")}
      >
        <div className="flex flex-col gap-2">
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2">
            <Switch
              checked={game.generateBackgroundImage}
              disabled={!hasImageProvider}
              onCheckedChange={(checked) => setField("generateBackgroundImage", checked)}
            />
            {t("backgroundImageToggle")}
          </label>
          {hasImageProvider === false && (
            <p className="text-xs text-muted-foreground">
              {t("backgroundImageNeedsProvider")}{" "}
              <Link
                href="/parent/settings/ai-providers"
                className="font-semibold underline underline-offset-2 hover:opacity-80"
              >
                {t("openSettings")}
              </Link>
            </p>
          )}
        </div>
      </Field>

      <Field
        label={t("previewImageLabel")}
        hint={hasImageProvider === false ? undefined : t("previewImageHint")}
      >
        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2">
          <Switch
            checked={game.generatePreviewImage}
            disabled={!hasImageProvider}
            onCheckedChange={(checked) => setField("generatePreviewImage", checked)}
          />
          {t("previewImageToggle")}
        </label>
      </Field>

      {/* The settings form owns the save action — the built game auto-saves, so
          there is no global Save button. A planning draft shows "Save & start
          building" (its Dodi panel is still hidden until the settings are saved);
          an existing game shows "Save changes". A planning draft's save failures
          surface here since its composer is hidden; an existing game keeps its
          visible Dodi-panel error. */}
      <div className="mt-2 flex flex-col gap-3 border-t border-border pt-6">
        {isPlanning && error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}
        {isPlanning && hasAcceptedPlan && (
          <p className="text-xs text-muted-foreground">{t("planBuildHint")}</p>
        )}
        <Button
          size="lg"
          className="w-full"
          onClick={onSave}
          disabled={saving || (isPlanning && !game.title.trim())}
        >
          {justSaved ? (
            <>
              <Icon name="check" size={16} />
              {t("saved")}
            </>
          ) : !isPlanning ? (
            t("saveChanges")
          ) : (
            <>
              <Icon name="sparkles" size={16} />
              {t("saveAndBuild")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-ink-2">
          {label}
          {required ? <RequiredMark /> : null}
        </label>
      </div>
      {children}
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

