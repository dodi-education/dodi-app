import { API_VERSION, VERSION_HEADER } from "@dodi/billing-contract";

/**
 * Client for the commercial dodi AI control plane (ai.dodi.app — dodi-com,
 * NOT the OSS platform). Same login as the platform: requests carry the
 * Better Auth session token as a bearer, which ai.dodi.app verifies against
 * the platform's `/api/auth/get-session`.
 *
 * No URL ⇒ self-host mode: every dodi AI surface is hidden and no request is
 * ever made (PROJECT.md: "Self-host / no cloud AI URL → hide top-up and dodi
 * AI; BYOK only").
 */
/**
 * Whether the apps offer dodi AI at all. The open beta launches with the
 * parent's own keys only, so this is off: the client behaves as in self-host
 * mode (no dodi AI tab, card or picker option, no request to ai.dodi.app)
 * even where the control-plane URL is configured. Turn it on when dodi AI
 * launches.
 */
export const IS_DODI_AI_OFFERED = false;

export interface DodiAIClient {
  isConfigured(): boolean;
  request(path: string, init?: RequestInit): Promise<Response>;
}

export function createDodiAIClient(opts: {
  url: string | null;
  fetch: typeof fetch;
  getAccessToken: () => string | null;
}): DodiAIClient {
  return {
    isConfigured: () => Boolean(opts.url),
    request: (path, init = {}) => {
      if (!opts.url) throw new Error("dodi AI is not configured");
      return opts.fetch(`${opts.url}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${opts.getAccessToken()}`,
          [VERSION_HEADER]: API_VERSION,
          ...(init.headers ?? {}),
        },
      });
    },
  };
}
