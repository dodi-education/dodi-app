import { getAccessToken } from "@/lib/auth/client";
import { API_VERSION, VERSION_HEADER } from "@dodi/billing-contract";

/**
 * Client for the commercial dodi AI control plane (ai.dodi.app — dodi-com,
 * NOT the OSS platform). Same login as the platform: requests carry the
 * Better Auth session token as a bearer, which ai.dodi.app verifies against
 * the platform's `/api/auth/get-session`.
 *
 * `NEXT_PUBLIC_DODI_AI_URL` unset ⇒ self-host mode: every dodi AI surface is
 * hidden and no request is ever made (PROJECT.md: "Self-host / no cloud AI
 * URL → hide top-up and dodi AI; BYOK only").
 */
export function isDodiAIConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_DODI_AI_URL);
}

export async function dodiAIRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_DODI_AI_URL;
  if (!base) throw new Error("dodi AI is not configured (NEXT_PUBLIC_DODI_AI_URL)");
  const token = getAccessToken();
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      [VERSION_HEADER]: API_VERSION,
      ...(init.headers ?? {}),
    },
  });
}
