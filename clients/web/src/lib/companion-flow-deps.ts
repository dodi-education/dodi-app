/**
 * The browser's dependencies for the shared companion flows
 * (`@dodi/client-state/companions`), used by the parent pages and the kid's
 * Playground alike.
 */
import type { CompanionDeps } from "@dodi/client-state/companions";
import type { TeachTrickDeps } from "@dodi/client-state/custom-tricks";
import { createTelemetry } from "@dodi/client-state/telemetry";

import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";

export function companionFlowDeps(): CompanionDeps {
  return { api: dodi, kids: clientState.kids, vault: clientState.vault };
}

/** What teaching a custom trick needs: the vault-held thinking key and usage reporting. */
export function teachTrickDeps(): TeachTrickDeps {
  return {
    resolveThinking: () => clientState.execution.resolveThinking(),
    reportUsage: createTelemetry(dodi).reportUsage,
  };
}
