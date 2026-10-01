/**
 * The account's image provider, model and vault-decrypted key, resolved in the
 * browser (keys live only in the unlocked vault). Null when no image model is
 * configured or no key is available. Logic: `@dodi/client-state`.
 */
import type { ResolvedExecution } from "@dodi/client-state";

import { clientState } from "@/lib/client-state";

export type ResolvedClientImage = ResolvedExecution;

export function resolveClientImage(): Promise<ResolvedClientImage | null> {
  return clientState.execution.resolveImage();
}
