// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

/** The family's own avatars and accessories, opened (files on demand). */
export const useCharacterAssetStore = bindStore(clientState.characterAssets);

/** Discover submissions of the family's own assets, per asset id. */
export const useAssetPublicationStore = bindStore(clientState.assetPublications);
