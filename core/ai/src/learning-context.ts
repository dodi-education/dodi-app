/**
 * Pure, browser-importable assembly of the audience-scoped learning context
 * (memory + parent notes) the coding agent uses to tailor a game's difficulty,
 * visuals, and concept.
 *
 * Under E2EE the memory/parent-notes fields are encrypted at rest and the server
 * cannot decrypt them — so the browser decrypts via the vault and assembles this
 * string, then passes it to the agent route. This module is the single source of
 * truth for that formatting (shared by the client assembler and any defensive
 * server-side use), with no supabase/node imports so it stays browser-safe.
 */

/** Per-kid character cap so family-scope context doesn't balloon the prompt. */
export const LEARNING_CONTEXT_CHARS_PER_KID = 1500;

export interface LearningContextKid {
  id: string;
  /** Decrypted memory dossier (null/empty when none). */
  memory: string | null;
  /** Decrypted parent notes (null/empty when none). */
  parent_notes: string | null;
}

export interface LearningAudience {
  isFamily: boolean;
  audienceIds: string[];
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Assemble the learning context from ALREADY-DECRYPTED kids, scoped by "who can
 * play": family → all kids; specific audienceIds → those kids; otherwise the
 * primary kid. Each kid's memory/notes are clipped to
 * LEARNING_CONTEXT_CHARS_PER_KID. Returns undefined when no selected kid has any
 * memory or notes.
 */
export function buildLearningContext(
  kids: LearningContextKid[],
  audience: LearningAudience | undefined,
  primaryKidId: string,
): string | undefined {
  let selected: LearningContextKid[];
  if (audience?.isFamily) {
    selected = kids;
  } else if (audience && audience.audienceIds.length > 0) {
    const ids = new Set(audience.audienceIds);
    selected = kids.filter((k) => ids.has(k.id));
  } else {
    selected = kids.filter((k) => k.id === primaryKidId);
  }

  const blocks: string[] = [];
  for (const k of selected) {
    const memory = (k.memory ?? "").trim();
    const notes = (k.parent_notes ?? "").trim();
    if (!memory && !notes) continue;
    const parts: string[] = [];
    if (memory) {
      parts.push(`Learning memory:\n${clip(memory, LEARNING_CONTEXT_CHARS_PER_KID)}`);
    }
    if (notes) {
      parts.push(`Parent notes:\n${clip(notes, LEARNING_CONTEXT_CHARS_PER_KID)}`);
    }
    blocks.push(parts.join("\n\n"));
  }

  if (blocks.length === 0) return undefined;
  return blocks.length > 1
    ? blocks.map((b, i) => `### Child ${i + 1}\n${b}`).join("\n\n")
    : blocks[0];
}
