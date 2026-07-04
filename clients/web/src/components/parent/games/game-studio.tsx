"use client";

import { dodi } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { GameStage } from "@/components/games/game-stage";
import { RequiredMark } from "@/components/parent/rows";
import { Icon, type IconName } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGE } from "@/lib/games/stage";
import { GAME_TAGS } from "@dodi/games/tags";
import { cn } from "@/lib/utils";
import { useKids } from "@/hooks/use-kids";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";
import { resolveClientThinking } from "@/lib/ai/resolve-client-thinking";
import { calculateChildAge } from "@dodi/ai/dodi-context";
import { buildLearningContext } from "@dodi/ai/learning-context";
import type { AgentProgressEvent, AgentStep } from "@dodi/types/agent-progress";
import type { AgentCodeResult } from "@dodi/types/tasks";
import type { AgentSessionResult } from "@dodi/types/database";
import type { ProgressKind } from "@dodi/games/success";

interface KidOption {
  id: string;
  name: string;
  /** Decrypted personal fields, used to assemble agent context client-side. */
  birthdate: string | null;
  memory: string | null;
  parent_notes: string | null;
}

export interface StudioGame {
  id: string | null;
  title: string;
  tags: string[];
  description: string;
  learningGoal: string;
  successDefinition: string;
  progressKind: ProgressKind;
  codeBundle: string;
  markdown: string;
  /** Specific kid IDs this game is shared with (empty when family). */
  audienceIds: string[];
  /** Shared with the whole family. */
  isFamily: boolean;
  /** Dodi has built this game at least once (false for a freshly-saved draft). */
  built: boolean;
  /** Playable by kids. Parent-created games start inactive until activated. */
  isActive: boolean;
}

interface GameStudioProps {
  initialGame?: StudioGame;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SIDE_MIN = 300;
const SIDE_MAX = 620;
const SIDE_DEFAULT = 384;
const COMPOSER_MIN = 60;
const COMPOSER_MAX = 520;
const COMPOSER_DEFAULT = 150;

function emptyGame(): StudioGame {
  return {
    id: null,
    title: "",
    tags: [],
    description: "",
    learningGoal: "",
    successDefinition: "",
    progressKind: "open",
    codeBundle: "",
    markdown: "",
    audienceIds: [],
    // New games default to the whole family; parents narrow this if they want.
    isFamily: true,
    built: false,
    isActive: false,
  };
}

/** Map a persisted agent_sessions.progress value to a visual step. */
function progressToStep(progress: string): AgentStep {
  switch (progress) {
    case "planning":
      return "reading_docs";
    case "building":
      return "writing_code";
    case "testing":
      return "validating";
    case "done":
      return "finalizing";
    default:
      return "reading_docs";
  }
}

/** Read a /api/agent/sessions SSE stream, invoking callbacks, returning the terminal event. */
async function readAgentStream(
  body: ReadableStream<Uint8Array>,
  onStep: (step: AgentStep) => void,
  onSession?: (sessionId: string) => void,
): Promise<{ type: "complete"; result: AgentCodeResult } | { type: "error"; message: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;
      let event: AgentProgressEvent;
      try {
        event = JSON.parse(json) as AgentProgressEvent;
      } catch {
        continue;
      }
      if (event.type === "session_started") onSession?.(event.sessionId);
      else if (event.type === "step") onStep(event.step);
      else if (event.type === "complete") return event;
      else if (event.type === "error") return event;
    }
  }
  return { type: "error", message: "Stream ended unexpectedly" };
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

export function GameStudio({ initialGame }: GameStudioProps) {
  const t = useTranslations("gameStudio");
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
  }));

  const [game, setGame] = useState<StudioGame>(initialGame ?? emptyGame());

  // Surface the live game title in the shared breadcrumb bar (the studio has no
  // top bar of its own); clear it when leaving the studio.
  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    setLeaf(game.title.trim() || t("addGame"));
    return () => setLeaf(null);
  }, [game.title, setLeaf, t]);

  const [view, setView] = useState<"preview" | "code" | "settings">(
    initialGame?.id ? "preview" : "settings",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [step, setStep] = useState<AgentStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mandatory settings fields left empty on save — drives the red field markers.
  const [invalid, setInvalid] = useState<{
    title?: boolean;
    learningGoal?: boolean;
    audience?: boolean;
  }>({});
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Whether an explicit thinking model is configured (model_config.thinkingProvider).
  // Game build/edit needs it — the voice model alone can't drive the agent.
  // null = still loading, so we don't flash the warning before we know.
  const [hasThinkingProvider, setHasThinkingProvider] = useState<boolean | null>(null);
  // DB id of the in-flight / recovered agent task (drives the Stop button).
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sideWidth, setSideWidth] = useState(SIDE_DEFAULT);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_DEFAULT);
  // Portrait phones + upright tablets get a vertical, tab-switched layout
  // (matches the `compact` CSS variant). Landscape/desktop keep the resizable
  // side-by-side panes.
  const vertical = useMediaQuery("(orientation: portrait), (max-width: 767px)");
  // New games open on the Game tab (settings must be filled before the chat
  // unlocks); existing games open on the Dodi chat.
  const [mtab, setMtab] = useState<"game" | "chat">(
    initialGame?.id ? "chat" : "game",
  );
  const threadRef = useRef<HTMLDivElement | null>(null);
  const sideWidthRef = useRef(SIDE_DEFAULT);
  const composerHeightRef = useRef(COMPOSER_DEFAULT);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const recoveredRef = useRef(false);

  // The chat is locked until a draft has been persisted (new-game hard gate):
  // the parent fills mandatory settings + saves, which redirects to /[id].
  const locked = !game.id;

  // Building/editing a game is a complex task that requires an explicitly
  // configured thinking model. Without one we lock the composer (just like the
  // unsaved-draft gate) and surface a subtle warning above the input box.
  const needsThinkingProvider = hasThinkingProvider === false;
  const composerLocked = locked || needsThinkingProvider;

  // Restore persisted panel sizes.
  useEffect(() => {
    const w = parseInt(localStorage.getItem("dodi-studio-side-width") ?? "", 10);
    if (w >= SIDE_MIN && w <= SIDE_MAX) {
      sideWidthRef.current = w;
      setSideWidth(w);
    }
    const h = parseInt(localStorage.getItem("dodi-studio-input-height") ?? "", 10);
    if (h >= COMPOSER_MIN && h <= COMPOSER_MAX) {
      composerHeightRef.current = h;
      setComposerHeight(h);
    }
  }, []);

  // Resolve whether a thinking model is configured (legacy gameProvider counts).
  // Drives the composer lock + warning so we never fall back to the voice model
  // for a build, which is what surfaced the "invalid x-api-key" failures.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await dodi.request("/api/ai/config");
        if (cancelled) return;
        if (!res.ok) {
          setHasThinkingProvider(false);
          return;
        }
        const cfg = (await res.json()) as
          | { thinkingProvider?: string; gameProvider?: string }
          | null;
        setHasThinkingProvider(Boolean(cfg?.thinkingProvider ?? cfg?.gameProvider));
      } catch {
        if (!cancelled) setHasThinkingProvider(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  };

  // ── "Who can play" selection ───────────────────────────────────────────
  const primaryKidId = game.isFamily
    ? (kids[0]?.id ?? null)
    : (game.audienceIds[0] ?? null);
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

  // ── Agent task recovery / polling ──────────────────────────────────────
  // The server task keeps running even if the SSE stream is dropped (e.g. the
  // parent navigated away). On reopen we re-attach to the active session, mirror
  // its progress, and poll the DB until it reaches a terminal state — and we
  // surface the most recent change summary so the recap survives a reload.
  const stopPolling = (): void => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  /** Merge a completed result (live or recovered) into the editable game state. */
  const applyResult = (r: AgentSessionResult): void => {
    setGame((g) => ({
      ...g,
      built: true,
      title: r.title,
      tags: r.tags,
      description: r.description,
      learningGoal: r.learningGoal,
      successDefinition: r.successDefinition,
      progressKind: r.progressKind,
      codeBundle: r.codeBundle,
      markdown: r.markdown,
    }));
    setView("preview");
  };

  const pollSession = (id: string): void => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const res = await dodi.request(`/api/agent/sessions/${id}`);
          if (!res.ok) {
            stopPolling();
            setThinking(false);
            setStep(null);
            return;
          }
          const session = (await res.json()) as {
            status: string;
            progress: string;
            result: AgentSessionResult | null;
            error: string | null;
            title: string;
          };
          if (session.status === "active") {
            setStep(progressToStep(session.progress));
            return;
          }
          stopPolling();
          setThinking(false);
          setStep(null);
          setSessionId(null);
          if (session.status === "completed" && session.result) {
            applyResult(session.result);
            const summary = session.result.changeSummary?.trim();
            setMessages((m) => [
              ...m,
              { role: "assistant", text: summary || `Updated **${session.result!.title}**.` },
            ]);
            router.refresh();
          } else if (session.status === "failed") {
            setError(session.error || t("buildFailed"));
          }
        } catch {
          stopPolling();
          setThinking(false);
          setStep(null);
        }
      })();
    }, 3000);
  };

  /** Show the most recent completed task's change summary (recap on reopen). */
  const showLastSummary = async (gameId: string, kidId: string): Promise<void> => {
    try {
      const res = await dodi.request(
        `/api/agent/sessions?kidId=${kidId}&status=completed&limit=10`,
      );
      if (!res.ok) return;
      const sessions = (await res.json()) as Array<{
        game_id: string | null;
        result: AgentSessionResult | null;
      }>;
      const match = sessions.find((s) => s.game_id === gameId && s.result);
      const summary = match?.result?.changeSummary?.trim();
      if (summary) {
        setMessages((m) => (m.length === 0 ? [{ role: "assistant", text: summary }] : m));
      }
    } catch {
      /* non-critical */
    }
  };

  const recoverSession = async (gameId: string, kidId: string): Promise<void> => {
    try {
      const res = await dodi.request(
        `/api/agent/sessions?kidId=${kidId}&gameId=${gameId}&context=game_creation&limit=1`,
      );
      if (!res.ok) return;
      const session = (await res.json()) as {
        id: string;
        status: string;
        progress: string;
        task_prompt: string;
      } | null;
      if (!session) {
        void showLastSummary(gameId, kidId);
        return;
      }
      if (session.status === "active") {
        setSessionId(session.id);
        setThinking(true);
        setStep(progressToStep(session.progress));
        if (session.task_prompt) {
          setMessages([{ role: "user", text: session.task_prompt }]);
        }
        pollSession(session.id);
      }
    } catch {
      /* non-critical */
    }
  };

  const stop = async (): Promise<void> => {
    if (!sessionId) return;
    stoppingRef.current = true;
    stopPolling();
    try {
      await dodi.request(`/api/agent/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
      });
    } catch {
      /* best effort */
    }
    setThinking(false);
    setStep(null);
    setSessionId(null);
  };

  // Re-attach to any in-flight (or recently completed) task once we know the
  // game id and the kid it was launched for.
  useEffect(() => {
    if (recoveredRef.current) return;
    if (!game.id || !primaryKidId) return;
    recoveredRef.current = true;
    void recoverSession(game.id, primaryKidId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, primaryKidId]);

  useEffect(() => () => stopPolling(), []);

  const stepLabel = (s: AgentStep): string => {
    const map: Record<AgentStep, string> = {
      reading_docs: t("stepReadingDocs"),
      writing_code: t("stepWritingCode"),
      validating: t("stepValidating"),
      fixing_validation: t("stepFixingValidation"),
      finalizing: t("stepFinalizing"),
    };
    return map[s];
  };

  async function send(raw?: string): Promise<void> {
    const text = (raw ?? draft).trim();
    if (!text || thinking) return;
    // New-game hard gate: a draft must be persisted (giving us a game id) before
    // Dodi can build. The composer is disabled in this state, but guard anyway.
    if (locked) {
      setError(t("saveBeforeBuild"));
      setView("settings");
      return;
    }
    // Defensive: the composer is disabled when no thinking model is configured,
    // but starter buttons / Enter could still reach here.
    if (needsThinkingProvider) {
      setError(t("needThinkingProvider"));
      return;
    }
    if (!primaryKidId) {
      setInvalid((v) => ({ ...v, audience: true }));
      setView("settings");
      return;
    }
    setError(null);
    setDraft("");
    setMessages((m) => [...m, { role: "user", text }]);
    setThinking(true);
    setStep(null);

    // First build of a freshly-saved draft uses generate_game semantics (build
    // from scratch) even though the game id exists; later edits are updates.
    const isUpdate = game.built;
    const payload: Record<string, unknown> = isUpdate
      ? {
          instruction: text,
          existingCode: game.codeBundle,
          existingMarkdown: game.markdown,
          title: game.title || undefined,
          learningGoal: game.learningGoal || undefined,
          successDefinition: game.successDefinition || undefined,
        }
      : {
          prompt: text,
          title: game.title || undefined,
          tags: game.tags,
          learningGoal: game.learningGoal || undefined,
          successDefinition: game.successDefinition || undefined,
        };

    try {
      // The provider key lives only in the unlocked vault — resolve it here and
      // hand it to the server agent (which cannot decrypt it itself).
      const thinking = await resolveClientThinking();
      if (!thinking) {
        setThinking(false);
        setError(t("needProviderKey"));
        return;
      }
      const childName = kids.find((k) => k.id === primaryKidId)?.name;

      // Memory/parent-notes and birthdate are E2EE — assemble the agent's
      // learning context and age in the browser (the server can't decrypt them)
      // and pass them in, mirroring how the vault-decrypted apiKey is handed over.
      const learningContext = buildLearningContext(
        kids,
        { isFamily: game.isFamily, audienceIds: game.audienceIds },
        primaryKidId,
      );
      const age =
        calculateChildAge(
          kids.find((k) => k.id === primaryKidId)?.birthdate ?? null,
        ) ?? undefined;

      const res = await dodi.request("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          kidId: primaryKidId,
          taskType: isUpdate ? "update_game" : "generate_game",
          gameId: game.id ?? undefined,
          payload,
          apiKey: thinking.apiKey,
          provider: thinking.provider,
          model: thinking.model,
          childName,
          learningContext,
          age,
          audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const outcome = await readAgentStream(res.body, setStep, setSessionId);
      if (outcome.type === "error") throw new Error(outcome.message);

      const r = outcome.result;
      setGame((g) => ({
        ...g,
        id: r.savedGameId ?? g.id,
        built: true,
        title: r.title,
        tags: r.tags,
        description: r.description,
        learningGoal: r.learningGoal,
        successDefinition: r.successDefinition,
        progressKind: r.progressKind,
        codeBundle: r.codeBundle,
        markdown: r.markdown,
      }));
      const summary = r.changeSummary?.trim();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: summary
            ? summary
            : isUpdate
              ? `Updated **${r.title}** — the preview and code are refreshed.`
              : `Here's **${r.title}** — it's live in the preview; flip to Code to see what I wrote.`,
        },
      ]);
      setView("preview");
      if (r.saveError) {
        // The game was generated but not persisted — tell the user why.
        setError(t("saveFailed", { reason: r.saveError }));
      } else {
        // Bust the router cache so the game appears in the library list.
        router.refresh();
      }
    } catch {
      // A deactivation (user pressed Stop) surfaces as a stream error — don't
      // dress that up as a failure.
      if (stoppingRef.current) {
        setMessages((m) => [...m, { role: "assistant", text: t("stopped") }]);
      } else {
        setError(t("buildFailed"));
        setMessages((m) => [...m, { role: "assistant", text: t("buildFailed") }]);
      }
    } finally {
      setThinking(false);
      setStep(null);
      setSessionId(null);
      stoppingRef.current = false;
      requestAnimationFrame(() => {
        if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
      });
    }
  }

  async function saveSettings(): Promise<void> {
    if (saving) return;
    // Mandatory fields: a title (brand-new games only), a learning goal, and a
    // child/audience. Empty ones are flagged red instead of showing a message.
    // (Server schemas stay permissive so voice/system game creation, which has
    // no parent goal, still works.)
    const nextInvalid = {
      title: !game.id && !game.title.trim(),
      learningGoal: !game.learningGoal.trim(),
      audience: !primaryKidId,
    };
    if (nextInvalid.title || nextInvalid.learningGoal || nextInvalid.audience) {
      setInvalid(nextInvalid);
      setView("settings");
      return;
    }
    setInvalid({});
    setError(null);
    setSaving(true);
    try {
      if (game.id) {
        // Re-mapping the success definition to structured criteria needs the
        // thinking provider key, which lives only in the unlocked vault — resolve
        // it here and hand it over (the server cannot decrypt it). Absent (no
        // provider configured), the server just persists the text unchanged.
        const thinking = await resolveClientThinking();
        const res = await dodi.request(`/api/games/${game.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: game.title || undefined,
            tags: game.tags,
            learning_goal: game.learningGoal,
            success_definition: game.successDefinition,
            is_active: game.isActive,
            audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
            apiKey: thinking?.apiKey,
            provider: thinking?.provider,
            model: thinking?.model,
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
      } else {
        // Persist a new game straight from settings (no build required).
        const res = await dodi.request("/api/games", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kidId: primaryKidId,
            title: game.title.trim(),
            tags: game.tags,
            learningGoal: game.learningGoal || undefined,
            successDefinition: game.successDefinition || undefined,
            codeBundle: game.codeBundle || undefined,
            audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { id: string };
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

  const starters = [
    t("starterCounting"),
    t("starterMath"),
    t("starterStory"),
    t("starterDrawing"),
  ];

  const statusText = thinking ? (step ? stepLabel(step) : t("working")) : t("designerRole");

  return (
    <div
      className="fixed inset-x-0 top-[116px] bottom-0 z-30 flex flex-col bg-background wide:top-[72px] wide:left-56"
      data-screen-label={editing ? "Parent — Edit game" : "Parent — New game"}
    >
      {/* Mobile tab bar (vertical layout only) */}
      {vertical && (
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
            "flex min-h-0 flex-1 flex-col bg-background",
            vertical && mtab !== "game" && "hidden",
          )}
        >
          <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 md:px-5">
            <div className="inline-flex gap-0.5 rounded-[10px] border border-border bg-background p-[3px]">
              <SegTab active={view === "preview"} onClick={() => setView("preview")} icon="show" label={t("preview")} />
              <SegTab active={view === "code"} onClick={() => setView("code")} icon="code" label={t("code")} />
            </div>
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
              {game.id && (
                <span
                  className={cn(
                    "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex",
                    game.isActive
                      ? "bg-primary-soft text-primary"
                      : "bg-foreground/5 text-muted-foreground",
                  )}
                  title={t("activeHint")}
                >
                  <span
                    className={cn(
                      "h-[7px] w-[7px] rounded-full",
                      game.isActive ? "bg-primary" : "bg-faint",
                    )}
                  />
                  {game.isActive ? t("active") : t("inactive")}
                </span>
              )}
              <button
                type="button"
                onClick={() => setView("settings")}
                title={t("settings")}
                className={cn(
                  "flex h-[34px] w-[34px] items-center justify-center rounded-lg border transition-colors",
                  view === "settings"
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border-strong bg-card text-muted-foreground hover:border-faint hover:text-ink-2",
                )}
              >
                <Icon name="settings" size={17} />
              </button>
              <Button
                size="sm"
                onClick={saveSettings}
                disabled={saving || (!game.id && !game.title.trim())}
              >
                {justSaved ? (
                  <>
                    <Icon name="check" size={14} />
                    {t("saved")}
                  </>
                ) : game.id ? (
                  t("saveChanges")
                ) : (
                  t("saveAndBuild")
                )}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === "preview" && (
              <div className="flex min-h-full items-center justify-center p-5 md:p-8">
                {game.codeBundle ? (
                  <GameStage
                    gameId={game.id ?? "preview"}
                    codeBundle={game.codeBundle}
                    reserved={STAGE.reservedStudio}
                  />
                ) : (
                  <EmptyStage title={t("previewEmpty")} />
                )}
              </div>
            )}
            {view === "code" &&
              (game.codeBundle ? (
                <pre className="min-h-full overflow-auto bg-card p-5 font-mono text-[12.5px] leading-[1.75] text-ink-2">
                  {game.codeBundle}
                </pre>
              ) : (
                <div className="flex min-h-full items-center justify-center p-8">
                  <EmptyStage title={t("codeEmpty")} icon="code" />
                </div>
              ))}
            {view === "settings" && (
              <SettingsForm
                game={game}
                kids={kids}
                invalid={invalid}
                setField={setField}
                selectFamily={selectFamily}
                toggleKid={toggleKid}
                t={t}
              />
            )}
          </div>
        </div>

        {/* Chat sidebar */}
        <div
          style={vertical ? undefined : { width: sideWidth }}
          className={cn(
            "relative flex min-h-0 flex-col border-border bg-card",
            vertical
              ? cn("w-full flex-1", mtab !== "chat" && "hidden")
              : "flex-none border-l",
          )}
        >
          {/* Resize handle (horizontal layout only) */}
          {!vertical && (
            <div
              onMouseDown={startSideResize}
              className="group absolute -left-1 bottom-0 top-0 z-10 flex w-2.5 cursor-col-resize items-center justify-center"
              title="Drag to resize"
            >
              <span className="h-7 w-0.5 rounded bg-border-strong transition-all group-hover:h-11 group-hover:bg-primary" />
            </div>
          )}

          {/* Header */}
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft p-0.5">
              <Image
                src="/images/dodi-head-active.png"
                alt=""
                width={36}
                height={36}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
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
          </div>

          {/* Thread */}
          <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-[18px] px-[18px] pb-1.5 pt-[18px]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center px-1 pb-2 pt-6 text-center">
                  <Image
                    src="/images/dodi-active.png"
                    alt=""
                    width={56}
                    height={56}
                    className="mb-3 h-14 w-14 object-contain"
                  />
                  <h2 className="text-[18px] font-bold tracking-tight text-ink">
                    {locked ? t("lockedTitle") : t("welcomeTitle")}
                  </h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {locked ? t("lockedHint") : t("welcomeDesc")}
                  </p>
                  {!locked && !needsThinkingProvider && (
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
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[88%] rounded-2xl rounded-tr-[5px] bg-primary-soft px-3.5 py-2.5 text-sm font-medium leading-[1.6] text-ink">
                        <RichText text={m.text} />
                      </div>
                    </div>
                  ),
                )
              )}
              {thinking && (
                <div className="flex items-center gap-3">
                  <Image
                    src="/images/dodi-head-active.png"
                    alt=""
                    width={30}
                    height={30}
                    className="-mt-px h-[30px] w-[30px] shrink-0 object-contain"
                  />
                  <div className="flex gap-1.5 py-1.5">
                    <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-faint [animation-delay:0ms]" />
                    <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-faint [animation-delay:150ms]" />
                    <span className="h-[7px] w-[7px] animate-bounce rounded-full bg-faint [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="flex-shrink-0 px-4 pb-3.5 pt-2">
            {needsThinkingProvider && (
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
            {error && (
              <div className="mb-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs font-medium text-danger">
                {error}
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
              <textarea
                style={{ height: composerHeight }}
                disabled={composerLocked}
                className="block w-full resize-none border-0 bg-transparent p-0 pb-1.5 text-[14.5px] leading-normal text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
                placeholder={
                  locked
                    ? t("composerPlaceholderLocked")
                    : needsThinkingProvider
                      ? t("composerPlaceholderNoThinking")
                      : messages.length === 0
                        ? t("composerPlaceholderEmpty")
                        : t("composerPlaceholder")
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => (thinking ? void stop() : void send())}
                  disabled={composerLocked || (thinking ? !sessionId : !draft.trim())}
                  aria-label={thinking ? t("stop") : t("send")}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors active:scale-95",
                    (thinking ? sessionId : draft.trim() && !composerLocked)
                      ? "bg-primary hover:bg-primary-hover"
                      : "bg-border-strong",
                  )}
                >
                  <Icon name={thinking ? "stop" : "send"} size={17} />
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] leading-snug text-faint">{t("footer")}</p>
          </div>
        </div>
      </div>
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
  icon: "show" | "code";
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
  t,
}: {
  game: StudioGame;
  kids: KidOption[];
  invalid: { title?: boolean; learningGoal?: boolean; audience?: boolean };
  setField: <K extends keyof StudioGame>(key: K, value: StudioGame[K]) => void;
  selectFamily: () => void;
  toggleKid: (id: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  // Predefined catalog plus any extra tags the agent already added to the game.
  const tagOptions = [...GAME_TAGS, ...game.tags.filter((tag) => !GAME_TAGS.includes(tag as never))];
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

      {game.id && (
        <Field label={t("visibilityLabel")} hint={t("activeHint")}>
          <button
            type="button"
            role="switch"
            aria-checked={game.isActive}
            onClick={() => setField("isActive", !game.isActive)}
            className={cn(
              "inline-flex items-center gap-2.5 self-start rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
              game.isActive
                ? "border-primary bg-primary-soft text-primary"
                : "border-border-strong bg-card text-muted-foreground hover:border-faint",
            )}
          >
            <span
              className={cn(
                "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors",
                game.isActive ? "bg-primary" : "bg-border-strong",
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                  game.isActive ? "translate-x-[13px]" : "translate-x-[2px]",
                )}
              />
            </span>
            {game.isActive ? t("active") : t("inactive")}
          </button>
        </Field>
      )}

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
          {tagOptions.map((tag) => {
            const selected = game.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  setField(
                    "tags",
                    selected
                      ? game.tags.filter((x) => x !== tag)
                      : [...game.tags, tag],
                  )
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold capitalize transition-colors",
                  selected
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border-strong bg-card text-ink-2 hover:border-faint",
                )}
              >
                {tag}
                {selected && <Icon name="check" size={13} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </Field>
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

/** Minimal markdown: **bold** only. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-bold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
