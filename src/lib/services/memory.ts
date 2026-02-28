import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { Database, SystemLogInsert } from "@/types/database";
import { DEFAULT_DODI_SOUL } from "@/lib/services/personas";
import { logMemoryEvents } from "@/lib/services/system-logs";

type Client = SupabaseClient<Database>;

/** Hint injected when memory is empty (first session with this child). */
export const EMPTY_MEMORY_HINT =
  "This is your first time meeting this child. Focus on getting to know them — ask about their interests, favorite things, and what they'd like to explore together.";

/**
 * Build the system instruction for end-of-session memory update.
 * Takes the full persona soul — the AI reads the ## Memory section naturally.
 */
export function buildMemoryUpdateInstruction(personaSoul: string): string {
  return `You are maintaining a memory dossier about a child for their AI learning companion.

You will receive:
1. The current memory document (may be empty if this is the first session)
2. A transcript of the session that just ended

Your task: produce an UPDATED memory document that merges new observations from the session into the existing memory.

## Persona Context
The following is the full persona soul document. Follow any ## Memory instructions you find in it for guidance on what to remember and what to discard. If there is no ## Memory section, use sensible defaults.

${personaSoul}

## Output Format
Write the memory as a markdown document with these sections (create them as needed):

- **## About** — name, age, basic facts
- **## Interests** — topics, games, subjects they enjoy
- **## Strengths** — what they're good at, where they shine
- **## Challenges** — areas where they struggle or need support
- **## Learning Style** — how they learn best (visual, hands-on, etc.)
- **## Emotional Patterns** — how they handle frustration, what motivates them
- **## Session History** — brief dated notes from recent sessions

## Rules
- Keep each section concise — bullet points, not paragraphs
- Add dates when noting new observations (e.g., "Loves dinosaurs (Feb 28)")
- For single observations, express uncertainty: "Seemed interested in..." vs "Loves..."
- Strengthen confidence after multiple observations: "Consistently enjoys..."
- Never remove information without good reason (e.g., contradicted by newer data)
- Preserve parent-provided context — you may reference it but never overwrite it
- Keep the total document under 2000 words
- Write in English regardless of the child's language setting

## Response Format
You MUST respond with a JSON object (no markdown fences, no preamble):
{
  "memory": "the updated markdown dossier",
  "stored": [{"observation": "what was remembered", "reason": "why it was stored"}],
  "discarded": [{"observation": "what was ignored", "reason": "why it was discarded"}]
}

The "stored" array lists new observations you added to the memory.
The "discarded" array lists observations you intentionally chose NOT to store (e.g., due to persona memory rules).
If nothing was discarded, use an empty array.`;
}

/**
 * @deprecated Use buildMemoryUpdateInstruction(personaSoul) instead.
 */
export const MEMORY_UPDATE_INSTRUCTION =
  buildMemoryUpdateInstruction(DEFAULT_DODI_SOUL);

interface MemoryObservation {
  observation: string;
  reason: string;
}

interface MemoryUpdateResult {
  memory: string;
  stored: MemoryObservation[];
  discarded: MemoryObservation[];
}

/**
 * Parse the AI's memory update response.
 * Falls back to treating the entire response as plain markdown if JSON parsing fails.
 */
export function parseMemoryUpdateResponse(text: string): MemoryUpdateResult {
  try {
    // Try to extract JSON from the response (may have markdown fences)
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed: unknown = JSON.parse(jsonStr);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "memory" in parsed &&
      typeof (parsed as MemoryUpdateResult).memory === "string"
    ) {
      const result = parsed as MemoryUpdateResult;
      return {
        memory: result.memory,
        stored: Array.isArray(result.stored) ? result.stored : [],
        discarded: Array.isArray(result.discarded) ? result.discarded : [],
      };
    }
  } catch {
    // JSON parsing failed — graceful degradation
  }

  // Fallback: treat entire response as plain markdown memory
  return { memory: text.trim(), stored: [], discarded: [] };
}

interface ProcessMemoryUpdateParams {
  supabase: Client;
  profileId: string;
  accountId: string;
  personaId: string | null;
  personaSoul: string;
  sessionTranscript: string;
  apiKey: string;
}

interface ProcessMemoryUpdateResult {
  memory: string;
  storedCount: number;
  discardedCount: number;
}

/**
 * Shared function for processing memory updates.
 * Used by both the API route and orphan checkpoint recovery.
 */
export async function processMemoryUpdate(
  params: ProcessMemoryUpdateParams,
): Promise<ProcessMemoryUpdateResult> {
  const {
    supabase,
    profileId,
    accountId,
    personaId,
    personaSoul,
    sessionTranscript,
    apiKey,
  } = params;

  // Fetch current memory
  const currentMemory = await getMemory(supabase, profileId);

  // Build the prompt
  const prompt = [
    "## Current Memory Document",
    currentMemory || "(empty — this was the first session)",
    "",
    "## Session Transcript",
    sessionTranscript,
  ].join("\n");

  // Call Gemini for memory update
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: buildMemoryUpdateInstruction(personaSoul),
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const response = await model.generateContent(prompt);
  const responseText = response.response.text().trim();

  if (!responseText) {
    // Log the error and bail
    await logMemoryEvents(supabase, [
      {
        profile_id: profileId,
        account_id: accountId,
        persona_id: personaId,
        event: "error",
        message: "Memory update failed: AI returned empty response",
      },
    ]);
    throw new Error("AI returned empty memory update");
  }

  // Parse the structured response
  const result = parseMemoryUpdateResponse(responseText);

  // Write updated memory
  await updateMemory(supabase, profileId, result.memory);

  // Build log entries
  const logEntries: SystemLogInsert[] = [];

  for (const item of result.stored) {
    logEntries.push({
      profile_id: profileId,
      account_id: accountId,
      persona_id: personaId,
      event: "memory_stored",
      message: `${item.observation} — ${item.reason}`,
    });
  }

  for (const item of result.discarded) {
    logEntries.push({
      profile_id: profileId,
      account_id: accountId,
      persona_id: personaId,
      event: "memory_discarded",
      message: `${item.observation} — ${item.reason}`,
    });
  }

  logEntries.push({
    profile_id: profileId,
    account_id: accountId,
    persona_id: personaId,
    event: "memory_updated",
    message: `Memory dossier updated with ${result.stored.length} new observation${result.stored.length !== 1 ? "s" : ""}`,
  });

  if (logEntries.length > 0) {
    await logMemoryEvents(supabase, logEntries);
  }

  return {
    memory: result.memory,
    storedCount: result.stored.length,
    discardedCount: result.discarded.length,
  };
}

export async function getMemory(
  supabase: Client,
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("memory")
    .eq("id", profileId)
    .single();

  if (error) throw error;
  return data.memory as string | null;
}

export async function updateMemory(
  supabase: Client,
  profileId: string,
  memory: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ memory })
    .eq("id", profileId);

  if (error) throw error;
}

export async function getParentNotes(
  supabase: Client,
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("parent_notes")
    .eq("id", profileId)
    .single();

  if (error) throw error;
  return data.parent_notes as string | null;
}
