/**
 * The app's dependencies for the shared companion flows
 * (`@dodi/client-state/companions`, `custom-tricks`), used by the parent
 * screens and the kid's Playground alike. Mirrors the web's lib/companion-flow-deps.
 */
import type { CompanionDeps } from "@dodi/client-state/companions";
import type { TeachTrickDeps } from "@dodi/client-state/custom-tricks";
import { createTelemetry } from "@dodi/client-state/telemetry";

import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

export function companionFlowDeps(): CompanionDeps {
  return { api, kids: clientState.kids, vault: clientState.vault };
}

/** What teaching a custom trick needs: the vault-held thinking key and usage reporting. */
export function teachTrickDeps(): TeachTrickDeps {
  return {
    resolveThinking: () => clientState.execution.resolveThinking(),
    reportUsage: createTelemetry(api).reportUsage,
  };
}
