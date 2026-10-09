/**
 * What a family's connected agent (the dodi CLI, paired as an agent device)
 * may do. Mirrors the `devices_scopes_check` constraint. The server checks a
 * scope on every route an agent bearer may reach and refuses all other routes,
 * so a scope here is a server-side boundary: the agent holds the vault key and
 * could open any ciphertext it got hold of, which is why the server decides
 * what ciphertext it gets.
 */

export const AGENT_SCOPES = [
  "games",
  "games:publish",
  "kids:basic",
  "kids:memory",
  "assets",
  "assets:publish",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

/** What `dodi login` asks for unless told otherwise. */
export const DEFAULT_AGENT_SCOPES: readonly AgentScope[] = [
  "games",
  "games:publish",
  "kids:basic",
  "assets",
  "assets:publish",
];

/** Scopes the approval screen marks as sensitive (shown with a warning, off by default). */
export const SENSITIVE_AGENT_SCOPES: readonly AgentScope[] = ["kids:memory"];

/** How long a parent can let an agent connection live, in days. */
export const AGENT_EXPIRY_DAYS = [7, 30, 90] as const;
export const DEFAULT_AGENT_EXPIRY_DAYS = 30;

export function isAgentScope(value: unknown): value is AgentScope {
  return typeof value === "string" && (AGENT_SCOPES as readonly string[]).includes(value);
}

/** Keep the known scopes, drop duplicates and anything unknown. */
export function normalizeAgentScopes(values: unknown): AgentScope[] {
  if (!Array.isArray(values)) return [];
  return AGENT_SCOPES.filter((scope) => values.includes(scope));
}
