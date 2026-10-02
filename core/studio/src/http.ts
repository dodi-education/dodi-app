/** Small helpers for the studio's platform calls (`StudioApi`). */

import type { StudioApi } from "./ports";

/** Pull the server's error message from a failed JSON response. */
export async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** A JSON request; a non-2xx answer throws with the server's reason. */
export async function sendJson(
  api: StudioApi,
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<Response> {
  const res = await api.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res;
}
