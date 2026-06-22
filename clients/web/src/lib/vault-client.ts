/**
 * Browser-side calls to the vault-keys endpoint. The blobs are opaque; only the
 * client ever derives the VMK from them.
 */
import type { StoredVaultKeys } from "@dodi/vault";

/** Pull the server's `{ error }` message out of a failed response, if any. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error ? `: ${body.error}` : "";
  } catch {
    return "";
  }
}

export async function fetchVaultKeys(): Promise<StoredVaultKeys | null> {
  const res = await fetch("/api/vault/keys", { method: "GET" });
  if (!res.ok) {
    throw new Error(
      `Failed to load vault keys (${res.status})${await errorDetail(res)}`,
    );
  }
  const data = (await res.json()) as { vaultKeys: StoredVaultKeys | null };
  return data.vaultKeys ?? null;
}

export async function saveVaultKeys(keys: StoredVaultKeys): Promise<void> {
  const res = await fetch("/api/vault/keys", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(keys),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to save vault keys (${res.status})${await errorDetail(res)}`,
    );
  }
}
