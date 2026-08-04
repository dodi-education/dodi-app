/**
 * Predefined game tags — the canonical catalog.
 *
 * Each tag has a stable `id` (stored on games, emitted by the coding agent, and
 * used as the i18n key) and an `icon` (a Tabler icon slug the web `Icon`
 * component resolves; `philosophy` is a custom glyph). Display titles are
 * translated in the web app under the `tags` i18n namespace — never hard-code a
 * human label here.
 *
 * List views render tags as icons (label via aria/title); editor chips and
 * filters show the translated title alongside the icon.
 *
 * `ai` and `ai-image` are capability tags, layered on top of any subject tags:
 * add `ai` to games that generate AI text and `ai-image` to games that generate
 * AI images (e.g. the system drawing games are tagged `drawing` + `ai-image`).
 */
export interface GameTagDef {
  /** Stable tag id — stored on games and used as the i18n title key. */
  id: string;
  /** Tabler icon slug resolved by the web `Icon` component. */
  icon: string;
}

export const GAME_TAGS = [
  { id: "alphabet", icon: "abc" },
  { id: "numbers", icon: "123" },
  { id: "math", icon: "math-symbols" },
  { id: "writing", icon: "pencil" },
  { id: "grammar", icon: "text-grammar" },
  { id: "reading", icon: "book" },
  { id: "drawing", icon: "image-generation" },
  { id: "music", icon: "music" },
  { id: "coding", icon: "code" },
  { id: "reasoning", icon: "sort-descending-shapes" },
  { id: "discernment", icon: "eye-question" },
  { id: "philosophy", icon: "philosophy" },
  { id: "physics", icon: "atom" },
  { id: "chemistry", icon: "flask" },
  { id: "biology", icon: "seedling" },
  { id: "ai", icon: "ai" },
  { id: "ai-image", icon: "photo-ai" },
] as const satisfies readonly GameTagDef[];

export type GameTag = (typeof GAME_TAGS)[number]["id"];

/** Just the tag ids — for catalog membership checks and filtering. */
export const GAME_TAG_IDS: readonly GameTag[] = GAME_TAGS.map((tag) => tag.id);
