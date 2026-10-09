import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StoredVaultKeys } from "@dodi/vault";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";
import {
  activateClient,
  claimClient,
  createAccessKeyClient,
  createPendingClient,
  getActiveAgentClient,
  getActivePairedClient,
  listAuthorizedClients,
  registerOwnClient,
  requestedScopes,
  revokeClient,
  revokeOwnAgent,
} from "./authorized-clients";
import {
  agentVaultKeys,
  getStoredVaultKeys,
  removeDeviceWrap,
  setStoredVaultKeys,
} from "./vault-keys";

/**
 * authorized_clients: everything that can open the vault. Paired clients
 * (robot, agent) carry their grant; browsers and the app register themselves;
 * the Access list merges in sessions that never registered; revoking is one
 * step (wrap, status, session).
 */

const wrap = (deviceId: string) => ({
  deviceId,
  deviceKemPublicKey: `kem-${deviceId}`,
  wrapped: { kemCiphertext: "c", nonce: "n", ciphertext: "x" },
});

async function insertSession(
  t: TestDatabase,
  userId: string,
  userAgent: string | null,
): Promise<string> {
  const row = await t.serviceDb
    .insertInto("auth_sessions")
    .values({
      token: `tok-${Math.random()}`,
      user_id: userId,
      user_agent: userAgent,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("paired clients (robot, agent)", () => {
  let t: TestDatabase;
  let accountId: string;
  let n = 0;

  async function pairAgent(scopes: string[]) {
    n += 1;
    const deviceId = `agent-${n}`;
    const { pairingCode } = await createPendingClient(t.serviceDb, {
      deviceId,
      kemPublicKey: "kem",
      signPublicKey: "sign",
      name: "Claude Code",
      kind: "agent",
      scopes,
    });
    const claimed = await claimClient(t.serviceDb, pairingCode, accountId);
    return { deviceId, claimed };
  }

  beforeAll(async () => {
    t = await createTestDb();
    accountId = await t.createAccount("agents@example.com");
  });

  afterAll(async () => {
    await t.close();
  });

  it("stores what the CLI asks for and drops unknown scopes", async () => {
    const { claimed } = await pairAgent([
      "games",
      "kids:basic",
      "account:everything",
    ]);
    expect(claimed.kind).toBe("agent");
    expect(requestedScopes(claimed)).toEqual(["games", "kids:basic"]);
  });

  it("lets the parent narrow the grant but never widen it", async () => {
    const { deviceId, claimed } = await pairAgent(["games", "kids:basic"]);
    const now = new Date("2026-10-09T10:00:00Z");
    const client = await activateClient(
      t.scopedDb(accountId),
      accountId,
      claimed.id,
      { scopes: ["games", "kids:memory"], expiresInDays: 7 },
      now,
    );
    expect(client.status).toBe("active");
    expect(client.scopes).toEqual(["games"]);
    expect(new Date(client.expires_at!).toISOString()).toBe(
      "2026-10-16T10:00:00.000Z",
    );
    expect(
      (await getActiveAgentClient(t.serviceDb, accountId, deviceId, now))
        ?.scopes,
    ).toEqual(["games"]);
  });

  it("refuses an agent without a grant, a bad expiry and a second activation", async () => {
    const { claimed } = await pairAgent(["games"]);
    const db = t.scopedDb(accountId);
    await expect(activateClient(db, accountId, claimed.id)).rejects.toThrow();
    await expect(
      activateClient(db, accountId, claimed.id, {
        scopes: ["games"],
        expiresInDays: 0,
      }),
    ).rejects.toThrow();
    await activateClient(db, accountId, claimed.id, {
      scopes: ["games"],
      expiresInDays: null,
    });
    await expect(
      activateClient(db, accountId, claimed.id, {
        scopes: ["games"],
        expiresInDays: null,
      }),
    ).rejects.toThrow();
  });

  it("treats an expired agent as inactive", async () => {
    const { deviceId, claimed } = await pairAgent(["games"]);
    const now = new Date("2026-10-09T10:00:00Z");
    await activateClient(
      t.scopedDb(accountId),
      accountId,
      claimed.id,
      { scopes: ["games"], expiresInDays: 7 },
      now,
    );
    const later = new Date("2026-10-17T10:00:00Z");
    expect(
      await getActiveAgentClient(t.serviceDb, accountId, deviceId, later),
    ).toBeNull();
    expect(
      await getActivePairedClient(t.serviceDb, deviceId, later),
    ).toBeNull();
    expect(
      await getActivePairedClient(t.serviceDb, deviceId, now),
    ).not.toBeNull();
  });

  it("ends the connection when the agent revokes itself", async () => {
    const { deviceId, claimed } = await pairAgent(["games"]);
    await activateClient(t.scopedDb(accountId), accountId, claimed.id, {
      scopes: ["games"],
      expiresInDays: null,
    });
    await revokeOwnAgent(
      t.scopedDb(accountId),
      t.serviceDb,
      accountId,
      deviceId,
    );
    expect(
      await getActiveAgentClient(t.serviceDb, accountId, deviceId),
    ).toBeNull();
  });

  it("creates an access key's agent already active, with only known scopes", async () => {
    const now = new Date("2026-10-09T10:00:00Z");
    const client = await createAccessKeyClient(
      t.scopedDb(accountId),
      accountId,
      {
        deviceId: "abcdef0123456789abcdef01",
        kemPublicKey: "kem",
        signPublicKey: "sign",
        name: "Home server",
        scopes: ["games", "account:everything"],
        expiresInDays: 30,
      },
      now,
    );
    expect(client).toMatchObject({
      kind: "agent",
      status: "active",
      scopes: ["games"],
      name: "Home server",
    });
    expect(new Date(client.expires_at!).toISOString()).toBe(
      "2026-11-08T10:00:00.000Z",
    );
    expect(
      await getActiveAgentClient(
        t.serviceDb,
        accountId,
        "abcdef0123456789abcdef01",
        now,
      ),
    ).not.toBeNull();
    await expect(
      createAccessKeyClient(t.scopedDb(accountId), accountId, {
        deviceId: "abcdef0123456789abcdef02",
        kemPublicKey: "kem",
        signPublicKey: "sign",
        name: "x",
        scopes: ["games"],
        expiresInDays: 0,
      }),
    ).rejects.toThrow("Expiry");
  });

  it("keeps robots unscoped and never lets a browser sign challenges", async () => {
    const { pairingCode } = await createPendingClient(t.serviceDb, {
      deviceId: "robot-1",
      kemPublicKey: "kem",
      signPublicKey: "sign",
      scopes: ["games"],
    });
    const claimed = await claimClient(t.serviceDb, pairingCode, accountId);
    expect(claimed.kind).toBe("robot");
    expect(claimed.scopes).toEqual([]);
    await activateClient(t.scopedDb(accountId), accountId, claimed.id);
    expect(await getActivePairedClient(t.serviceDb, "robot-1")).not.toBeNull();

    await registerOwnClient(t.scopedDb(accountId), accountId, {
      deviceId: "browser-x",
      kemPublicKey: "kem",
      kind: "browser",
      label: "Firefox on Linux",
      sessionId: null,
    });
    expect(await getActivePairedClient(t.serviceDb, "browser-x")).toBeNull();
  });
});

describe("the Access list and revoking", () => {
  let t: TestDatabase;
  let accountId: string;

  beforeAll(async () => {
    t = await createTestDb();
    accountId = await t.createAccount("access@example.com");
  });

  afterAll(async () => {
    await t.close();
  });

  it("lists registered clients, marks the current one, and adds unregistered sessions", async () => {
    const laptopSession = await insertSession(
      t,
      accountId,
      "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0",
    );
    const phoneSession = await insertSession(
      t,
      accountId,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
    );
    await setStoredVaultKeys(t.scopedDb(accountId), accountId, {
      deviceWraps: [wrap("laptop")],
      passwordWrap: null,
      vmkCheck: "enc:v1:check",
    } as unknown as StoredVaultKeys);
    await registerOwnClient(t.scopedDb(accountId), accountId, {
      deviceId: "laptop",
      kemPublicKey: "kem-laptop",
      kind: "browser",
      label: "Firefox on Linux",
      sessionId: laptopSession,
    });
    // A second registration (a later unlock) updates the same row.
    await registerOwnClient(t.scopedDb(accountId), accountId, {
      deviceId: "laptop",
      kemPublicKey: "kem-laptop",
      kind: "browser",
      label: "Firefox on Linux",
      sessionId: laptopSession,
    });

    const list = await listAuthorizedClients(
      t.scopedDb(accountId),
      t.serviceDb,
      accountId,
      { sessionId: laptopSession },
    );
    const laptop = list.find(
      (c) => c.label === "Firefox on Linux" && c.has_vault_access,
    );
    const phone = list.find((c) => c.id === phoneSession);
    expect(list.filter((c) => c.kind === "browser")).toHaveLength(2);
    expect(laptop).toMatchObject({ is_current: true, has_vault_access: true });
    expect(phone).toMatchObject({
      label: "Safari on iOS",
      has_vault_access: false,
      is_current: false,
    });
  });

  it("revokes a client in one step: wrap, status and session", async () => {
    const list = await listAuthorizedClients(
      t.scopedDb(accountId),
      t.serviceDb,
      accountId,
    );
    const laptop = list.find((c) => c.has_vault_access)!;
    const outcome = await revokeClient(
      t.scopedDb(accountId),
      t.serviceDb,
      accountId,
      laptop.id,
    );
    expect(outcome).toEqual({ revoked: true, wasCurrent: false });
    expect(
      (await getStoredVaultKeys(t.scopedDb(accountId), accountId))?.deviceWraps,
    ).toEqual([]);
    const sessions = await t.serviceDb
      .selectFrom("auth_sessions")
      .select("user_agent")
      .where("user_id", "=", accountId)
      .execute();
    expect(sessions.map((s) => s.user_agent)).not.toContain(
      "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0",
    );
    const after = await listAuthorizedClients(
      t.scopedDb(accountId),
      t.serviceDb,
      accountId,
    );
    expect(after.some((c) => c.id === laptop.id)).toBe(false);
  });

  it("ends a bare session, and refuses other accounts' entries", async () => {
    const other = await t.createAccount("other@example.com");
    const otherSession = await insertSession(t, other, null);
    expect(
      await revokeClient(
        t.scopedDb(accountId),
        t.serviceDb,
        accountId,
        otherSession,
      ),
    ).toEqual({ revoked: false });
    const list = await listAuthorizedClients(
      t.scopedDb(accountId),
      t.serviceDb,
      accountId,
    );
    const phone = list.find((c) => !c.has_vault_access)!;
    expect(
      await revokeClient(
        t.scopedDb(accountId),
        t.serviceDb,
        accountId,
        phone.id,
        { sessionId: phone.id },
      ),
    ).toEqual({
      revoked: true,
      wasCurrent: true,
    });
  });

  it("deletes a pending request instead of revoking it", async () => {
    const { pairingCode } = await createPendingClient(t.serviceDb, {
      deviceId: "pending-agent",
      kemPublicKey: "kem",
      signPublicKey: "sign",
      kind: "agent",
      scopes: ["games"],
    });
    const claimed = await claimClient(t.serviceDb, pairingCode, accountId);
    await revokeClient(
      t.scopedDb(accountId),
      t.serviceDb,
      accountId,
      claimed.id,
    );
    const rows = await t.serviceDb
      .selectFrom("authorized_clients")
      .select("id")
      .where("id", "=", claimed.id)
      .execute();
    expect(rows).toEqual([]);
  });

  it("never lets a browser registration take over a paired agent's row", async () => {
    const { pairingCode } = await createPendingClient(t.serviceDb, {
      deviceId: "shared-id",
      kemPublicKey: "kem",
      signPublicKey: "sign",
      kind: "agent",
      scopes: ["games"],
    });
    await claimClient(t.serviceDb, pairingCode, accountId);
    await registerOwnClient(t.scopedDb(accountId), accountId, {
      deviceId: "shared-id",
      kemPublicKey: "evil",
      kind: "browser",
      label: null,
      sessionId: null,
    });
    const row = await t.serviceDb
      .selectFrom("authorized_clients")
      .select(["kind", "kem_public_key"])
      .where("device_id", "=", "shared-id")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ kind: "agent", kem_public_key: "kem" });
  });
});

describe("agent vault keys", () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  const keys = {
    deviceWraps: [wrap("browser"), wrap("agent-a"), wrap("agent-b")],
    passwordWrap: { salt: "s", params: {}, nonce: "n", ciphertext: "x" },
    vmkCheck: "enc:v1:check",
  } as unknown as StoredVaultKeys;

  it("shows an agent only its own wrap and never the password wrap", () => {
    const seen = agentVaultKeys(keys, "agent-a");
    expect(seen?.deviceWraps.map((w) => w.deviceId)).toEqual(["agent-a"]);
    expect(seen?.passwordWrap).toBeNull();
    expect(seen?.vmkCheck).toBe("enc:v1:check");
  });

  it("removes one device's wrap and leaves the rest untouched", async () => {
    const accountId = await t.createAccount("wraps@example.com");
    await setStoredVaultKeys(t.scopedDb(accountId), accountId, keys);
    await removeDeviceWrap(t.scopedDb(accountId), accountId, "agent-a");
    const after = await getStoredVaultKeys(t.scopedDb(accountId), accountId);
    expect(after?.deviceWraps.map((w) => w.deviceId)).toEqual([
      "browser",
      "agent-b",
    ]);
    expect(after?.passwordWrap).toEqual(keys.passwordWrap);
  });
});

describe("backfill migration", () => {
  it("gives every existing vault wrap a browser row", async () => {
    const old = await createTestDb({
      upTo: "20261009120000_character_asset_publications",
    });
    try {
      const accountId = await old.createAccount("old@example.com");
      await sql`update accounts set vault_keys = ${JSON.stringify({
        deviceWraps: [wrap("old-browser"), wrap("old-phone")],
        passwordWrap: null,
        vmkCheck: "x",
      })}::jsonb where id = ${accountId}`.execute(old.serviceDb);
      await old.migrateToLatest();
      const rows = await old.serviceDb
        .selectFrom("authorized_clients")
        .select(["device_id", "kind", "status", "label"])
        .where("account_id", "=", accountId)
        .orderBy("device_id")
        .execute();
      expect(rows).toEqual([
        {
          device_id: "old-browser",
          kind: "browser",
          status: "active",
          label: null,
        },
        {
          device_id: "old-phone",
          kind: "browser",
          status: "active",
          label: null,
        },
      ]);
    } finally {
      await old.close();
    }
  }, 30_000);
});
