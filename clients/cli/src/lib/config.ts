/**
 * Where the CLI talks to and where it keeps its connection. Every value can be
 * overridden by env so self-hosted dodi instances and sandboxes work:
 *   DODI_API_URL     platform API (default https://platform.dodi.app)
 *   DODI_APP_URL     web app, for the approval link (default https://app.dodi.app)
 *   DODI_CONFIG_DIR  where credentials.json lives (default ~/.config/dodi)
 *   DODI_TOKEN       an agent access key (dodi_ak_…); wins over the stored login
 */
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_API_URL = "https://platform.dodi.app";
export const DEFAULT_APP_URL = "https://app.dodi.app";

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DODI_CONFIG_DIR) return env.DODI_CONFIG_DIR;
  const base = env.XDG_CONFIG_HOME || path.join(homedir(), ".config");
  return path.join(base, "dodi");
}

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), "credentials.json");
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function apiUrl(stored?: string, env: NodeJS.ProcessEnv = process.env): string {
  return trimSlash(env.DODI_API_URL || stored || DEFAULT_API_URL);
}

export function appUrl(stored?: string, env: NodeJS.ProcessEnv = process.env): string {
  return trimSlash(env.DODI_APP_URL || stored || DEFAULT_APP_URL);
}

/** The page a parent opens to approve a `dodi login`. */
export function approvalUrl(app: string, pairingCode: string): string {
  return `${trimSlash(app)}/authorize?code=${encodeURIComponent(pairingCode)}`;
}
