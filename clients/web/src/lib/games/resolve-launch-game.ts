/**
 * Resolves the `game_id` a voice model hands to the `launch_game` tool onto the
 * kid's game catalog. The model is asked for the UUID from the catalog, but it
 * regularly answers with the game's TITLE instead (lowercased, slugified,
 * umlauts folded) — an untrusted string that must never reach the URL bar as-is:
 * `/games/buchstabenlabyrinth` is a 404 for the kid.
 *
 * Pure and side-effect free so it can be pinned by unit tests.
 */

export interface LaunchGameCatalogEntry {
  id: string;
  title: string;
}

export type LaunchGameTarget =
  /** Exactly one catalog game matches — open it. */
  | { kind: "game"; id: string }
  /** The text matches several games' titles — show them instead of guessing. */
  | { kind: "ambiguous"; query: string }
  /** Nothing in the catalog matches — do not navigate. */
  | { kind: "unknown" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Loose comparison keys for a title: lowercase, punctuation/whitespace dropped,
 * and diacritics folded two ways (German transliteration "ä"→"ae" and plain
 * stripping "ä"→"a"), since a model may slugify either way.
 */
export function titleLookupKeys(value: string): string[] {
  const lower = value.toLowerCase();
  const transliterated = lower
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  const keys = new Set<string>();
  for (const variant of [lower, transliterated]) {
    const folded = variant.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const key = folded.replace(/[^\p{L}\p{N}]+/gu, "");
    if (key) keys.add(key);
  }
  return [...keys];
}

export function resolveLaunchGameTarget(
  rawGameId: string,
  catalog: ReadonlyArray<LaunchGameCatalogEntry>,
): LaunchGameTarget {
  const wanted = rawGameId.trim();
  if (!wanted) return { kind: "unknown" };

  const byId = catalog.find((g) => g.id.toLowerCase() === wanted.toLowerCase());
  if (byId) return { kind: "game", id: byId.id };

  const wantedKeys = new Set(titleLookupKeys(wanted));
  if (wantedKeys.size === 0) return { kind: "unknown" };

  const matchedIds = new Set<string>();
  for (const game of catalog) {
    if (titleLookupKeys(game.title).some((key) => wantedKeys.has(key))) {
      matchedIds.add(game.id);
    }
  }
  if (matchedIds.size === 1) {
    return { kind: "game", id: [...matchedIds][0] };
  }
  if (matchedIds.size > 1) return { kind: "ambiguous", query: wanted };
  return { kind: "unknown" };
}
