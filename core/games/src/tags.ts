/**
 * Predefined game tags.
 *
 * Tags replaced the former free-text "subject" field. Parents pick from this
 * catalog in the game studio; the coding agent is also asked to tag using it.
 * Seeded with the former subjects — extend this list to add more tags.
 */
export const GAME_TAGS = [
  "counting",
  "math",
  "language",
  "creativity",
  "science",
  "stories",
] as const;

export type GameTag = (typeof GAME_TAGS)[number];
