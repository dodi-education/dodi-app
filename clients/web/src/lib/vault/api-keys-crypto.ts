/**
 * Client-side encryption of the AI provider API keys under the account VMK.
 *
 * The whole providers map is sealed into ONE opaque blob via the VaultSession,
 * so the server stores only ciphertext (in `accounts.encrypted_api_keys`) and
 * can never read a key — replacing the old server-side `ENCRYPTION_SECRET` path.
 * The `keyPreview` (last 4 chars, for the UI) lives *inside* the encrypted blob,
 * so even that is invisible to the server.
 */
import type { AIProviderId } from "@/types/ai";

import type { VaultSession } from "./session";

export interface VaultProviderEntry {
  /** Plaintext provider API key — only ever exists in client memory. */
  key: string;
  /** Last 4 chars, for the parent UI ("…abcd"). */
  keyPreview: string;
  /** ISO timestamp the key was added (set by the caller). */
  addedAt: string;
}

export type VaultProviders = Partial<Record<AIProviderId, VaultProviderEntry>>;

/** Seal the providers map under the VMK into one opaque `enc:v1:` blob. */
export function encryptProviders(
  session: VaultSession,
  providers: VaultProviders,
): string {
  return session.encryptJson(providers);
}

/** Open the opaque blob back into the providers map (null/empty → {}). */
export function decryptProviders(
  session: VaultSession,
  blob: string | null | undefined,
): VaultProviders {
  if (!blob) return {};
  return session.decryptJson<VaultProviders>(blob) ?? {};
}

export function providerKeyPreview(apiKey: string): string {
  return apiKey.slice(-4);
}
