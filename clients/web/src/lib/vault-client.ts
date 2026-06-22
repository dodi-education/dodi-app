/**
 * Browser-side vault-keys calls. Thin wrapper over a same-origin, cookie-authed
 * DodiClient (the transport + logic now live in @dodi/protocol).
 */
import { DodiClient } from "@dodi/protocol";
import type { StoredVaultKeys } from "@dodi/vault";

const client = new DodiClient();

export function fetchVaultKeys(): Promise<StoredVaultKeys | null> {
  return client.getVaultKeys();
}

export function saveVaultKeys(keys: StoredVaultKeys): Promise<void> {
  return client.putVaultKeys(keys);
}
