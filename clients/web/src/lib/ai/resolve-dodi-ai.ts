/**
 * The configured → executable provider mapping ("dodi" → a real upstream
 * provider + inference key; BYOK → the vault key). Logic: `@dodi/client-state`
 * resolve-execution.ts.
 */
import type { ResolveExecutionInput, ResolvedExecution } from "@dodi/client-state";

import { clientState } from "@/lib/client-state";

export type {
  DodiAICategory,
  ResolveExecutionInput,
  ResolvedExecution,
} from "@dodi/client-state";

export function resolveExecution(input: ResolveExecutionInput): Promise<ResolvedExecution | null> {
  return clientState.execution.resolveExecution(input);
}
