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

/**
 * Total cap across ALL selected kids (~1000 words). Bounds the injected context
 * even for large families and prevents a bloated dossier from inflating token
 * cost — the per-kid cap alone doesn't bound the multi-kid concatenation.
 */
export const LEARNING_CONTEXT_MAX_TOTAL_CHARS = 6000;

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
 * Select the kids whose context applies, scoped by "who can play": family → all
 * kids; specific audienceIds → those kids; otherwise the primary kid.
 */
function selectKids(
  kids: LearningContextKid[],
  audience: LearningAudience | undefined,
  primaryKidId: string,
): LearningContextKid[] {
  if (audience?.isFamily) return kids;
  if (audience && audience.audienceIds.length > 0) {
    const ids = new Set(audience.audienceIds);
    return kids.filter((k) => ids.has(k.id));
  }
  return kids.filter((k) => k.id === primaryKidId);
}

/**
 * Assemble the learning context from ALREADY-DECRYPTED kids. Each kid's
 * memory/notes are clipped to LEARNING_CONTEXT_CHARS_PER_KID. Returns undefined
 * when no selected kid has any memory or notes.
 */
export function buildLearningContext(
  kids: LearningContextKid[],
  audience: LearningAudience | undefined,
  primaryKidId: string,
): string | undefined {
  const selected = selectKids(kids, audience, primaryKidId);

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
  const joined =
    blocks.length > 1
      ? blocks.map((b, i) => `### Child ${i + 1}\n${b}`).join("\n\n")
      : blocks[0];
  return clip(joined, LEARNING_CONTEXT_MAX_TOTAL_CHARS);
}

/**
 * Chars of the memory + parent-notes actually fed to the agent, using the same
 * audience scoping as buildLearningContext. For usage metering — lengths only,
 * never content (provider-blind).
 */
export function measureLearningContext(
  kids: LearningContextKid[],
  audience: LearningAudience | undefined,
  primaryKidId: string,
): { memoryChars: number; parentNotesChars: number } {
  let memoryChars = 0;
  let parentNotesChars = 0;
  for (const k of selectKids(kids, audience, primaryKidId)) {
    memoryChars += (k.memory ?? "").trim().length;
    parentNotesChars += (k.parent_notes ?? "").trim().length;
  }
  return { memoryChars, parentNotesChars };
}
