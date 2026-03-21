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
import {
  createAgentSession,
  cleanupStaleAgentSessions,
  failAgentSession,
} from "@/lib/services/agent-sessions";
import { createCustomGame, updateCustomGame } from "@/lib/services/games";
import { sanitizeGameBundle } from "@/lib/game-sanitizer";
import { createLogger } from "@/lib/logger";
import type { AgentTaskRequest, AgentCodeResult } from "@/types/tasks";
import type { AgentProgressEvent } from "@/types/agent-progress";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { calculateChildAge, getLanguageDisplayName } from "@/lib/services/dodi-context";

const log = createLogger("agent-task");

const TaskSchema = z.object({
  profileId: z.string().uuid(),
  taskType: z.enum(["generate_game", "update_game", "read_game_state"]),
  gameId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
});

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
): Promise<string> {
  const sanitized = sanitizeGameBundle(result.codeBundle);

  if (gameId) {
    const game = await updateCustomGame(supabase, gameId, {
      title: result.title,
      description: result.description,
      subject: result.subject,
      difficulty: result.difficulty,
      tags: result.tags,
      code_bundle: sanitized.code,
      markdown: result.markdown,
    });
    log.info("game_persisted", { profileId, gameId: game.id, created: false });
    return game.id;
  }

  const game = await createCustomGame(supabase, {
    accountId,
    profileId,
    title: result.title,
    description: result.description,
    subject: result.subject,
    difficulty: result.difficulty,
    tags: result.tags,
    codeBundle: sanitized.code,
    markdown: result.markdown,
    createdBy: "ai",
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
        { error: "No AI provider configured" },
        { status: 400 },
      );
    }

    const modelConfig = normalizeModelConfig(rawConfig);

    // Resolve thinking provider — fall back to voice provider for Gemini
    const thinkingProviderId = modelConfig.thinkingProvider ?? modelConfig.voiceProvider;
    const thinkingModel = modelConfig.thinkingModel ?? modelConfig.voiceModel;
    log.debug("config_resolved", { profileId, thinkingProvider: thinkingProviderId, thinkingModel });

    if (!thinkingProviderId || !thinkingModel) {
      return NextResponse.json(
        { error: "No thinking model configured" },
        { status: 400 },
      );
    }

    // For agent tasks, we need Anthropic
    if (taskType !== "read_game_state" && thinkingProviderId !== "anthropic") {
      // Fall back: if they only have Gemini, we can still try it for analysis
      // but for code generation we really need Anthropic
      // For now, allow any provider — the agent session will handle it
    }

    const apiKey = await decryptProviderKey(supabase, user.id, thinkingProviderId);

    const age = calculateChildAge(profile.birthdate) ?? undefined;

    const taskRequest: AgentTaskRequest = {
      profileId,
      taskType,
      gameId,
      childContext: {
        name: profile.display_name,
        age,
        language: getLanguageDisplayName(profile.language),
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
                  supabase, user.id, profileId, gameId, result as AgentCodeResult,
                );
                (result as AgentCodeResult).savedGameId = savedId;
              } catch (saveErr) {
                const saveMsg = saveErr instanceof Error ? saveErr.message : "Game save failed";
                log.error("game_persist_failed", { profileId, gameId, error: saveMsg });
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
          supabase, user.id, profileId, gameId, result as AgentCodeResult,
        );
        (result as AgentCodeResult).savedGameId = savedId;
      } catch (saveErr) {
        const saveMsg = saveErr instanceof Error ? saveErr.message : "Game save failed";
        log.error("game_persist_failed", { profileId, gameId, error: saveMsg });
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
