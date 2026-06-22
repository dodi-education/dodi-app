import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "../logger";
import type {
  Database,
  AgentSessionRow,
  AgentSessionResult,
} from "@dodi/types/database";

const log = createLogger("agent-sessions-db");

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Status & progress constants
// ---------------------------------------------------------------------------

export type AgentSessionStatus =
  | "active"
  | "completed"
  | "failed"
  | "deactivated";
export type AgentSessionProgress = "planning" | "building" | "testing" | "done";

const STALE_TIMEOUT_MINUTES = 10;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** Insert a new agent session row when a task starts. */
export async function createAgentSession(
  supabase: Client,
  input: {
    accountId: string;
    profileId: string;
    taskType: string;
    taskPrompt: string;
    dodiContext?: string;
    gameId?: string;
  },
): Promise<AgentSessionRow> {
  const { data, error } = await supabase
    .from("agent_sessions")
    .insert({
      account_id: input.accountId,
      profile_id: input.profileId,
      task_type: input.taskType,
      task_prompt: input.taskPrompt,
      dodi_context: input.dodiContext ?? "game_creation",
      game_id: input.gameId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as AgentSessionRow;
}

// ---------------------------------------------------------------------------
// Progress updates
// ---------------------------------------------------------------------------

/** Update the progress column during execution. */
export async function updateAgentSessionProgress(
  supabase: Client,
  sessionId: string,
  progress: AgentSessionProgress,
): Promise<void> {
  const { error } = await supabase
    .from("agent_sessions")
    .update({ progress })
    .eq("id", sessionId);

  if (error) {
    log.error("progress_update_failed", { sessionId, progress, error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Terminal states
// ---------------------------------------------------------------------------

/** Mark session as completed with the final result. */
export async function completeAgentSession(
  supabase: Client,
  sessionId: string,
  result: AgentSessionResult,
  gameId?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status: "completed" as const,
    progress: "done" as const,
    result,
    finished_at: new Date().toISOString(),
  };
  if (gameId) {
    update.game_id = gameId;
  }

  const { error } = await supabase
    .from("agent_sessions")
    .update(update)
    .eq("id", sessionId);

  if (error) {
    log.error("complete_failed", { sessionId, error: error.message });
  }
}

/** Mark session as failed with an error message. */
export async function failAgentSession(
  supabase: Client,
  sessionId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from("agent_sessions")
    .update({
      status: "failed" as const,
      error: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    log.error("fail_update_failed", { sessionId, errorMessage, dbError: error.message });
  }
}

/** Mark session as deactivated (parent abort). */
export async function deactivateAgentSession(
  supabase: Client,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("agent_sessions")
    .update({
      status: "deactivated" as const,
      deactivated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    log.error("deactivate_failed", { sessionId, error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Get the most recent active session for a profile (recovery entry point). */
export async function getActiveAgentSession(
  supabase: Client,
  profileId: string,
  dodiContext?: string,
  gameId?: string,
): Promise<AgentSessionRow | null> {
  let query = supabase
    .from("agent_sessions")
    .select("*")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (dodiContext) {
    query = query.eq("dodi_context", dodiContext);
  }

  if (gameId) {
    query = query.eq("game_id", gameId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as AgentSessionRow[];
  return rows[0] ?? null;
}

/** Get a single session by ID (for polling). */
export async function getAgentSession(
  supabase: Client,
  sessionId: string,
): Promise<AgentSessionRow | null> {
  const { data, error } = await supabase
    .from("agent_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }
  return data as unknown as AgentSessionRow;
}

interface ListAgentSessionsOptions {
  profileId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

/** List agent sessions for an account (parent view). */
export async function listAgentSessions(
  supabase: Client,
  accountId: string,
  options: ListAgentSessionsOptions = {},
): Promise<AgentSessionRow[]> {
  const { profileId, status, limit = 50, offset = 0 } = options;

  let query = supabase
    .from("agent_sessions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (profileId) {
    query = query.eq("profile_id", profileId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AgentSessionRow[];
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Mark active sessions older than STALE_TIMEOUT_MINUTES as failed.
 * Prevents phantom "active" rows from blocking recovery after server restarts.
 * Returns the number of cleaned sessions.
 */
export async function cleanupStaleAgentSessions(
  supabase: Client,
  accountId: string,
): Promise<number> {
  const cutoff = new Date(
    Date.now() - STALE_TIMEOUT_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("agent_sessions")
    .update({
      status: "failed" as const,
      error: "Session timed out",
      finished_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)
    .eq("status", "active")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    log.error("cleanup_failed", { accountId, error: error.message });
    return 0;
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    log.info("stale_cleaned", { accountId, count });
  }
  return count;
}
