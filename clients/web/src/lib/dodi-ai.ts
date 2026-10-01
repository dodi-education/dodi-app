import { clientState } from "@/lib/client-state";

/**
 * The commercial dodi AI control plane (ai.dodi.app) — see
 * `@dodi/client-state` dodi-ai.ts. `NEXT_PUBLIC_DODI_AI_URL` unset ⇒ self-host
 * mode: every dodi AI surface is hidden and no request is ever made.
 */
export function isDodiAIConfigured(): boolean {
  return clientState.dodiAI.isConfigured();
}

export function dodiAIRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return clientState.dodiAI.request(path, init);
}
