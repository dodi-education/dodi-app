// Shared logic: @dodi/client-state (discover-character-assets). This module
// binds the browser instance (lib/client-state.ts) to React.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

/** Avatars and accessories on Discover, with add / remove for the family. */
export const useDiscoverAssetStore = bindStore(clientState.discoverAssets);
