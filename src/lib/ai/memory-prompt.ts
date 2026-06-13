/**
 * Browser-safe memory-update prompt builder + response parser (extracted from
 * the server `memory.ts` so it can run client-side under E2EE — `memory.ts`
 * pulls in node `fs`/`path` via the logger).
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
The "discarded" array lists observations you intentionally chose NOT to store.
If nothing was discarded, use an empty array.`;
}

interface MemoryObservation {
  observation: string;
  reason: string;
}

export interface MemoryUpdateResult {
  memory: string;
  stored: MemoryObservation[];
  discarded: MemoryObservation[];
}

/** Parse the AI response; falls back to treating the whole text as the dossier. */
export function parseMemoryUpdateResponse(text: string): MemoryUpdateResult {
  try {
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
    // graceful degradation
  }
  return { memory: text.trim(), stored: [], discarded: [] };
}
