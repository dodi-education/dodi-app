import { dodi } from "@/lib/api";
import type { ListingText } from "@/lib/ai/client-translate-game";
import { useVaultStore } from "@/stores/vault-store";
import type { GameTranslation } from "@dodi/types/database";

/** The listing-related part of `GET /api/games/{id}/publication`. */
export interface PublicationListingsResponse {
  translations?: GameTranslation[];
  draftListingTranslationsEnc?: string | null;
}

/**
 * The per-locale listing texts already known for a game: the live copy's rows,
 * overlaid by the fresher sealed draft (a translate-then-leave round trip, or
 * edits made in the studio settings). The draft is decrypted in the unlocked
 * vault and ignored when it can't be (different key state or malformed).
 */
export function knownListingsFrom(
  response: PublicationListingsResponse,
): Record<string, ListingText> {
  let draftListings: Record<string, ListingText> = {};
  try {
    draftListings =
      useVaultStore
        .getState()
        .session?.decryptJson<Record<string, ListingText>>(
          response.draftListingTranslationsEnc,
        ) ?? {};
  } catch {
    draftListings = {};
  }
  return {
    ...Object.fromEntries(
      (response.translations ?? []).map((row) => [
        row.locale,
        { title: row.title, description: row.description },
      ]),
    ),
    ...draftListings,
  };
}

/** Fetch a game's known listing texts (see `knownListingsFrom`). */
export async function fetchKnownListings(
  gameId: string,
): Promise<Record<string, ListingText>> {
  const res = await dodi.request(`/api/games/${gameId}/publication`);
  if (!res.ok) throw new Error(`Failed to load listing translations (${res.status})`);
  return knownListingsFrom((await res.json()) as PublicationListingsResponse);
}

/**
 * Seal the listing texts into the game's DRAFT publication request. The game
 * is still E2EE-private at this point, so the server only ever sees ciphertext;
 * the next (re)submit picks the texts up via `knownListingsFrom`.
 */
export async function saveListingDraft(
  gameId: string,
  listings: Record<string, ListingText>,
): Promise<void> {
  const session = useVaultStore.getState().session;
  if (!session) throw new Error("Vault is locked");
  const res = await dodi.request(`/api/games/${gameId}/publication/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingTranslationsEnc: session.encryptJson(listings) }),
  });
  if (!res.ok) throw new Error(`Failed to save listing translations (${res.status})`);
}
