/**
 * Transport-only typed client for the Dodi platform HTTP API.
 *
 * Auth is pluggable: browsers use `cookie` (session cookie sent with the
 * request); the agent and other headless clients use `bearer` with a token
 * provider (the device challenge-response token from P7). `fetch` is injectable
 * so non-browser runtimes can supply their own.
 */
import type { StoredVaultKeys } from "@dodi/vault";

export type AuthStrategy =
  | { kind: "cookie" }
  | { kind: "bearer"; getToken: () => string | Promise<string> };

export interface DodiClientOptions {
  /** Base URL of the platform API. Empty (default) = same-origin relative paths. */
  baseUrl?: string;
  auth?: AuthStrategy;
  /** Override the fetch implementation (e.g. node/undici in the agent). */
  fetch?: typeof fetch;
}

/**
 * The npub in a vault-keys save is already bound to another account (or this
 * account is bound to a different npub). Retrying the same save cannot succeed
 * — callers must surface it, not loop.
 */
export class NpubConflictError extends Error {
  constructor() {
    super("This Nostr key is already linked to another account");
    this.name = "NpubConflictError";
  }
}

async function toError(res: Response, action: string): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) detail = `: ${body.error}`;
  } catch {
    // non-JSON body — ignore
  }
  return new Error(`Failed to ${action} (${res.status})${detail}`);
}

export class DodiClient {
  private readonly baseUrl: string;
  private readonly auth: AuthStrategy;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DodiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.auth = options.auth ?? { kind: "cookie" };
    const f = options.fetch ?? globalThis.fetch;
    if (!f) throw new Error("DodiClient: no fetch implementation available");
    // Bind to the global object: browser `fetch` brand-checks its receiver and
    // throws "Illegal invocation" if called as a method on anything else (here,
    // `this.fetchImpl(...)` would otherwise pass the client instance as `this`).
    this.fetchImpl = f.bind(globalThis);
  }

  /** Low-level request with auth applied. Exposed for endpoints not yet wrapped. */
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const requestInit: RequestInit = { ...init, headers };
    if (this.auth.kind === "cookie") {
      requestInit.credentials = "include";
    } else {
      headers.set("authorization", `Bearer ${await this.auth.getToken()}`);
    }
    return this.fetchImpl(`${this.baseUrl}${path}`, requestInit);
  }

  // --- Vault keys (folds the former web lib/vault-client.ts) -----------------

  async getVaultKeys(): Promise<StoredVaultKeys | null> {
    const res = await this.request("/api/vault/keys", { method: "GET" });
    if (!res.ok) throw await toError(res, "load vault keys");
    const data = (await res.json()) as { vaultKeys: StoredVaultKeys | null };
    return data.vaultKeys ?? null;
  }

  async putVaultKeys(
    keys: StoredVaultKeys,
    opts?: { npub?: string },
  ): Promise<void> {
    const res = await this.request("/api/vault/keys", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts?.npub ? { ...keys, npub: opts.npub } : keys),
    });
    if (res.status === 409) throw new NpubConflictError();
    if (!res.ok) throw await toError(res, "save vault keys");
  }
}
