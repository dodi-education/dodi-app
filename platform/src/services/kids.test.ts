import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { createKid, getKid, updateKid } from "./kids";

/**
 * kids service against real PGlite. The focus here is the two independent
 * companion-presence columns — deafened_dodi_at (hearing) and muted_dodi_at
 * (output) — which the PATCH route writes verbatim through updateKid.
 */
let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function kid(accountId: string): Promise<string> {
  seq += 1;
  const created = await createKid(t.serviceDb, {
    account_id: accountId,
    display_name: "enc:v1:name",
    social_id: `handle-${seq}`,
  });
  return created.id;
}

describe("companion presence columns", () => {
  it("round-trips muted_dodi_at through updateKid/getKid", async () => {
    const accountId = await t.createAccount(`parent-${(seq += 1)}@example.com`);
    const id = await kid(accountId);

    const at = "2026-09-15T10:00:00.000Z";
    await updateKid(t.serviceDb, id, { muted_dodi_at: at });
    let row = await getKid(t.serviceDb, id);
    expect(row?.muted_dodi_at).not.toBeNull();
    expect(new Date(row!.muted_dodi_at as string).toISOString()).toBe(at);

    await updateKid(t.serviceDb, id, { muted_dodi_at: null });
    row = await getKid(t.serviceDb, id);
    expect(row?.muted_dodi_at).toBeNull();
  });

  it("mutes output and hearing independently", async () => {
    const accountId = await t.createAccount(`parent-${(seq += 1)}@example.com`);
    const id = await kid(accountId);
    const at = "2026-09-15T11:00:00.000Z";

    // Muting output leaves the deaf column untouched...
    await updateKid(t.serviceDb, id, { muted_dodi_at: at });
    let row = await getKid(t.serviceDb, id);
    expect(row?.muted_dodi_at).not.toBeNull();
    expect(row?.deafened_dodi_at).toBeNull();

    // ...and going deaf leaves the mute untouched.
    await updateKid(t.serviceDb, id, { deafened_dodi_at: at });
    row = await getKid(t.serviceDb, id);
    expect(row?.deafened_dodi_at).not.toBeNull();
    expect(row?.muted_dodi_at).not.toBeNull();

    // Clearing one leaves the other set.
    await updateKid(t.serviceDb, id, { deafened_dodi_at: null });
    row = await getKid(t.serviceDb, id);
    expect(row?.deafened_dodi_at).toBeNull();
    expect(row?.muted_dodi_at).not.toBeNull();
  });
});
