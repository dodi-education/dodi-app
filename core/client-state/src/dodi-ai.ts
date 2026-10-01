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
