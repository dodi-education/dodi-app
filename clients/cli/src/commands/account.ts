/** dodi whoami / dodi logout. */
import { clearStoredCredentials, loadStoredCredentials } from "../lib/credentials";
import { CliError, EXIT, type Output } from "../lib/output";
import { connect } from "../lib/session";

interface SelfDevice {
  name: string | null;
  scopes: string[];
  expires_at: string | null;
  enrolled_at: string | null;
}

export async function runWhoami(_argv: string[], out: Output): Promise<number> {
  const conn = await connect();
  const { client: device } = await conn.api<{ client: SelfDevice | null }>("/api/authorized-clients/self");
  const who = await conn.api<{ accountId: string }>("/api/whoami");
  const result = {
    accountId: who.accountId,
    name: device?.name ?? null,
    scopes: device?.scopes ?? [],
    expiresAt: device?.expires_at ?? null,
    connectedAt: device?.enrolled_at ?? null,
    apiUrl: conn.identity.apiUrl,
    via: conn.identity.source,
  };
  out.result(result, () =>
    [
      `Connected to ${result.apiUrl} as "${result.name ?? "agent"}" (${result.via})`,
      `Scopes:  ${result.scopes.join(", ") || "none"}`,
      `Expires: ${result.expiresAt ?? "never"}`,
    ].join("\n"),
  );
  return EXIT.ok;
}

/** Disconnect: the platform revokes the device and drops its vault wrap, then the keys are deleted here. */
export async function runLogout(_argv: string[], out: Output): Promise<number> {
  const stored = await loadStoredCredentials();
  if (!stored && !process.env.DODI_TOKEN) {
    out.result({ status: "not_connected" }, () => "Not connected.");
    return EXIT.ok;
  }
  let revoked = false;
  if (stored?.status !== "pending") {
    try {
      const conn = await connect();
      await conn.api("/api/authorized-clients/self", { method: "DELETE" });
      revoked = true;
    } catch (error) {
      if (!(error instanceof CliError) || error.exitCode !== EXIT.unauthorized) throw error;
    }
  }
  await clearStoredCredentials();
  out.result({ status: "logged_out", revoked }, () =>
    revoked ? "Disconnected. The family's vault no longer opens for this agent." : "Removed the local credentials.",
  );
  return EXIT.ok;
}
