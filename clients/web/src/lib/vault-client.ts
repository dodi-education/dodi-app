/**
 * Browser-side vault-keys calls, routed through the platform API (platform.dodi.app)
 * with the user's bearer token, via the shared DodiClient.
 */
import type { StoredVaultKeys } from "@dodi/vault";

import { dodi } from "@/lib/api";

export function fetchVaultKeys(): Promise<StoredVaultKeys | null> {
  return dodi.getVaultKeys();
}

export function saveVaultKeys(keys: StoredVaultKeys): Promise<void> {
  return dodi.putVaultKeys(keys);
}
