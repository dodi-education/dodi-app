/**
 * Game plan DTOs — the studio's "Plan" step, where a parent brainstorms the
 * game idea with the plan agent before any code is written.
 *
 * A plan is deliberately just prose: a parent-facing, non-technical summary of
 * the game's mechanics that the parent can read, edit and approve. It is never
 * persisted as its own column — the accepted plan travels as the first user
 * turn of the build conversation (sealed in `games.agent_transcript_enc`), so
 * the AI reads it as the briefing it is rather than as a serialized record.
 */

export interface GamePlan {
  /**
   * The parent-facing plan summary. Formatted for the studio's RichText
   * renderer: `**Label**` lines and `- ` bullets only, no headings or tables.
   */
  summary: string;
}
