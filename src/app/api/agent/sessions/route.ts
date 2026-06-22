import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import {
  decryptProviderKey,
  getModelConfig,
  normalizeModelConfig,
} from "@/lib/services/ai-providers";
import {
  getOrCreateSession,
  submitTask,
  resetGameContext,
  trimHistory,
  AgentAbortedError,
} from "@/lib/ai/agent-session";
import { THINKING_MODEL_REQUIRED_MESSAGE } from "@/lib/ai/thinking-config";
import {
  createAgentSession,
  cleanupStaleAgentSessions,
  failAgentSession,
  listAgentSessions,
  getActiveAgentSession,
} from "@/lib/services/agent-sessions";
import {
  createCustomGame,
  replaceGameSharings,
  updateCustomGame,
} from "@/lib/services/games";
import { sanitizeGameBundle } from "@/lib/game-sanitizer";
import { createLogger } from "@/lib/logger";
import type { AgentTaskRequest, AgentCodeResult } from "@/types/tasks";
import type { AgentProgressEvent } from "@/types/agent-progress";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getLanguageDisplayName } from "@/lib/services/dodi-context";

const log = createLogger("agent-sessions");

/**
 * GET /api/agent/sessions — list agent sessions for the authenticated account.
 *
 * With `limit=1` the route switches to single-result (recovery) mode and
 * returns the most recent *active* session matching the profile/context/game
 * filters (an object or `null`) instead of an array.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const context = searchParams.get("context") ?? undefined;
  const gameId = searchParams.get("gameId") ?? undefined;
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

  try {
    // Single-result recovery mode: most recent active session for a profile.
    if (limit === 1) {
      if (!profileId) {
        return NextResponse.json(
          { error: "profileId is required" },
          { status: 400 },
        );
      }
      const session = await getActiveAgentSession(supabase, profileId, context, gameId);
      // RLS should enforce ownership, but be explicit.
      if (session && session.account_id !== user.id) {
        return NextResponse.json(null);
      }
      return NextResponse.json(session);
    }

    const sessions = await listAgentSessions(supabase, user.id, {
      profileId,
      status,
      limit,
      offset,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch agent sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — create and run an agent session (game generation/update/read).
// ---------------------------------------------------------------------------

/** Extract a useful message from an Error or a Supabase PostgrestError-like object. */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint].filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (parts.length) return parts.join(" — ");
    if (typeof o.code === "string") return `Database error ${o.code}`;
  }
  return "Game save failed";
}

const TaskSchema = z.object({
  profileId: z.string().uuid(),
  taskType: z.enum(["generate_game", "update_game", "read_game_state"]),
  gameId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
  // Client-supplied thinking key (vault-decrypted in the browser; the server
  // cannot decrypt E2EE provider keys itself). Used in-memory only.
  apiKey: z.string().min(1).optional(),
  provider: z.enum(["gemini", "openai", "anthropic", "xai"]).optional(),
  model: z.string().min(1).optional(),
  // Vault-decrypted child display name (server stores it encrypted).
  childName: z.string().min(1).max(120).optional(),
  // Vault-decrypted learning context (memory + parent notes) assembled in the
  // browser — the server cannot decrypt these E2EE fields itself.
  learningContext: z.string().max(20000).optional(),
  // Child's age, computed client-side from the vault-decrypted birthdate.
  age: z.number().int().min(0).max(25).optional(),
  // Who can play: shared with the whole family and/or specific kid profiles.
  audience: z
    .object({
      isFamily: z.boolean(),
      audienceIds: z.array(z.string().uuid()),
    })
    .optional(),
});

interface Audience {
  isFamily: boolean;
  audienceIds: string[];
}

/** Extract the human-readable prompt from the task payload. */
function extractTaskPrompt(taskType: string, payload: Record<string, unknown>): string {
  if (taskType === "generate_game") {
    return typeof payload.prompt === "string" ? payload.prompt : "";
  }
  if (taskType === "update_game") {
    return typeof payload.instruction === "string" ? payload.instruction : "";
  }
  return "";
}

/** Persist the agent's code result to the games table (create or update). */
async function persistGameResult(
  supabase: SupabaseClient<Database>,
  accountId: string,
  profileId: string,
  gameId: string | undefined,
  result: AgentCodeResult,
  audience?: Audience,
): Promise<string> {
  const sanitized = sanitizeGameBundle(result.codeBundle);
  // The agent should always name the game; fall back defensively so we never
  // persist an untitled (and therefore invisible-looking) game.
  const safeTitle = result.title.trim() ? result.title : "New game";

  if (gameId) {
    const game = await updateCustomGame(supabase, gameId, {
      title: safeTitle,
      description: result.description,
      tags: result.tags,
      code_bundle: sanitized.code,
      markdown: result.markdown,
      learning_goal: result.learningGoal,
      success_definition: result.successDefinition,
      success_criteria: result.successCriteria as unknown as Database["public"]["Tables"]["games"]["Update"]["success_criteria"],
      progress_kind: result.progressKind,
    });
    // Update "who can play" when the studio sent an audience. An AI build never
    // changes ownership (profile_id), the creator, or activation (is_active).
    if (audience) {
      await replaceGameSharings(supabase, gameId, accountId, {
        family: audience.isFamily,
        profileIds: audience.audienceIds,
      });
    }
    log.info("game_persisted", { profileId, gameId: game.id, created: false });
    return game.id;
  }

  // Parent-studio create: parent-owned (no profile_id) and inactive until a
  // parent activates it. Sharing defaults to the whole family.
  const game = await createCustomGame(supabase, {
    accountId,
    profileId: null,
    title: safeTitle,
    description: result.description,
    tags: result.tags,
    codeBundle: sanitized.code,
    markdown: result.markdown,
    createdBy: "parent",
    isActive: false,
    learningGoal: result.learningGoal,
    successDefinition: result.successDefinition,
    successCriteria: result.successCriteria,
    progressKind: result.progressKind,
  });
  await replaceGameSharings(supabase, game.id, accountId, {
    family: audience ? audience.isFamily : true,
    profileIds: audience?.audienceIds ?? [],
  });
  log.info("game_persisted", { profileId, gameId: game.id, created: true });
  return game.id;
}

export async function POST(request: Request): Promise<NextResponse | Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = TaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, taskType, gameId, payload } = parsed.data;
  log.info("task_submitted", { profileId, taskType, gameId });
  log.debug("task_prompt", {
    profileId,
    taskType,
    prompt: extractTaskPrompt(taskType, payload as Record<string, unknown>),
  });

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const rawConfig = await getModelConfig(supabase, user.id);
    if (!rawConfig) {
      return NextResponse.json(
        { error: THINKING_MODEL_REQUIRED_MESSAGE },
        { status: 400 },
      );
    }

    const modelConfig = normalizeModelConfig(rawConfig);

    // Resolve the thinking provider/model — prefer client-supplied values (E2EE:
    // only the browser can decrypt the provider key), then the stored config.
    // There is NO voice-provider fallback: Live (voice) models can't run the
    // agent, so an explicit thinking model is required.
    const thinkingProviderId =
      parsed.data.provider ?? modelConfig.thinkingProvider;
    const thinkingModel =
      parsed.data.model ?? modelConfig.thinkingModel;
    log.debug("config_resolved", { profileId, thinkingProvider: thinkingProviderId, thinkingModel });

    if (!thinkingProviderId || !thinkingModel) {
      return NextResponse.json(
        { error: THINKING_MODEL_REQUIRED_MESSAGE },
        { status: 400 },
      );
    }

    // Use the client-supplied key when present (the server cannot decrypt the
    // vault-sealed key); otherwise fall back to a legacy server-encrypted key.
    let apiKey: string;
    if (parsed.data.apiKey) {
      apiKey = parsed.data.apiKey;
    } else {
      try {
        apiKey = await decryptProviderKey(supabase, user.id, thinkingProviderId);
      } catch {
        return NextResponse.json(
          { error: "Missing AI provider key. Configure a provider key in Settings." },
          { status: 400 },
        );
      }
    }

    // Age and learning context are derived in the browser from vault-decrypted
    // fields (birthdate, memory, parent notes) — the server stores them encrypted
    // and cannot read them. Cap the context defensively against a buggy/oversized
    // client payload; a missing value just yields leaner (never garbled) context.
    const age = parsed.data.age;
    const learningContext =
      taskType === "generate_game" || taskType === "update_game"
        ? parsed.data.learningContext?.slice(0, 20000)
        : undefined;

    const taskRequest: AgentTaskRequest = {
      profileId,
      taskType,
      gameId,
      childContext: {
        // Never fall back to profile.display_name — it's E2EE ciphertext here.
        name: parsed.data.childName ?? "",
        age,
        language: getLanguageDisplayName(profile.language),
        learningContext,
      },
      payload: payload as unknown as AgentTaskRequest["payload"],
    };

    // Get or create session
    const session = getOrCreateSession(profileId, apiKey, thinkingModel);

    // Reset game context if game changed
    if (gameId && gameId !== session.currentGameId) {
      resetGameContext(profileId);
    }

    // Trim old history
    trimHistory(profileId);

    // --- DB persistence for code generation tasks ---
    const isCodeTask = taskType === "generate_game" || taskType === "update_game";
    let dbSessionId: string | undefined;

    if (isCodeTask) {
      // Clean up stale sessions before starting a new one
      await cleanupStaleAgentSessions(supabase, user.id);

      const dbSession = await createAgentSession(supabase, {
        accountId: user.id,
        profileId,
        taskType,
        taskPrompt: extractTaskPrompt(taskType, payload as Record<string, unknown>),
        dodiContext: "game_creation",
        gameId,
      });
      dbSessionId = dbSession.id;
    }

    // SSE streaming path
    const wantsSSE = request.headers.get("accept")?.includes("text/event-stream");

    if (wantsSSE) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: AgentProgressEvent): void => {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
            } catch {
              // Controller already closed
            }
          };

          // Emit session ID first so client can poll if SSE disconnects
          if (dbSessionId) {
            log.info("sse_stream_started", { profileId, dbSessionId });
            send({ type: "session_started", sessionId: dbSessionId });
          }

          try {
            const result = await submitTask(
              profileId,
              taskRequest,
              send,
              isCodeTask ? { dbSessionId, supabase } : undefined,
            );
            log.info("task_completed", { profileId, dbSessionId, taskType });

            // Persist game code to DB server-side (don't rely on client auto-save)
            if (isCodeTask && "codeBundle" in result && result.codeBundle) {
              try {
                const savedId = await persistGameResult(
                  supabase, user.id, profileId, gameId, result as AgentCodeResult, parsed.data.audience,
                );
                (result as AgentCodeResult).savedGameId = savedId;
              } catch (saveErr) {
                const saveMsg = describeError(saveErr);
                log.error("game_persist_failed", { profileId, gameId, error: saveMsg });
                (result as AgentCodeResult).saveError = saveMsg;
              }
            }

            send({ type: "complete", result } as AgentProgressEvent);
          } catch (err) {
            if (err instanceof AgentAbortedError) {
              log.warn("task_aborted", { profileId, dbSessionId });
              send({ type: "error", message: "Task was deactivated" });
            } else {
              const msg = err instanceof Error ? err.message : "Agent task failed";
              log.error("task_failed", { profileId, dbSessionId, message: msg });
              send({ type: "error", message: msg });
              // Mark DB session as failed
              if (dbSessionId) {
                await failAgentSession(supabase, dbSessionId, msg);
              }
            }
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Standard JSON path (backward compatible)
    const result = await submitTask(
      profileId,
      taskRequest,
      undefined,
      isCodeTask ? { dbSessionId, supabase } : undefined,
    );

    if (isCodeTask && "codeBundle" in result && result.codeBundle) {
      try {
        const savedId = await persistGameResult(
          supabase, user.id, profileId, gameId, result as AgentCodeResult, parsed.data.audience,
        );
        (result as AgentCodeResult).savedGameId = savedId;
      } catch (saveErr) {
        const saveMsg = describeError(saveErr);
        log.error("game_persist_failed", { profileId, gameId, error: saveMsg });
        (result as AgentCodeResult).saveError = saveMsg;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent task failed";

    if (message === "Agent is busy processing another task") {
      log.warn("agent_busy", { profileId });
      return NextResponse.json({ error: message, busy: true }, { status: 429 });
    }

    log.error("task_error", { profileId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
