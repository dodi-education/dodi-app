import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

/**
 * Re-registering an address that already has a verified account (reported
 * 2026-10-15: sign out, "register" again with an address registered weeks
 * earlier):
 *
 *  1. POST /api/auth/register answers `{ ok: true }` (anti-enumeration) but
 *     nothing is emailed, so the parent waits for a code that never comes.
 *  2. "Resend code" (send-verification-otp, type email-verification) DOES email
 *     a confirm code to the verified account; entering it auto-signs in to the
 *     EXISTING account, and the register page then tries to store a brand-new
 *     vault + npub on it. Only the set-once npub guard (409) stopped that from
 *     replacing the account's vault, and the client showed it as "This Nostr
 *     key is already linked to another account".
 *
 * Runs the real lib/auth.ts configuration on PGlite; only email delivery is
 * mocked, capturing every message so the test can see what the owner receives.
 */

interface SentEmail {
  to: string;
  subject: string;
  /** Set only on one-time code emails (AuthCodeEmail). */
  code?: string;
  kind?: string;
}

const { holder, sent } = vi.hoisted(() => ({
  holder: { db: null as unknown },
  sent: [] as SentEmail[],
}));

vi.mock("@/lib/db", () => ({
  get serviceDb() {
    return holder.db;
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(
    async (input: {
      to: string;
      subject: string;
      react: { props: { code?: string; kind?: string } };
    }) => {
      sent.push({
        to: input.to,
        subject: input.subject,
        code: input.react.props.code,
        kind: input.react.props.kind,
      });
      return true;
    },
  ),
}));

const EXISTING = "parent+existing@example.com";
const UNVERIFIED = "parent+unverified@example.com";
const PASSWORD = "correct horse battery";
const OTHER_PASSWORD = "a different password";
const EXISTING_NPUB = "a".repeat(64);

describe("registering an address that already has an account", () => {
  let t: TestDatabase;
  let auth: typeof import("./auth").auth;
  let register: typeof import("../app/api/auth/register/route").POST;
  let existingId = "";

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
    process.env.REGISTRATION_MODE = "open";
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;

    t = await createTestDb();
    holder.db = t.serviceDb;
    ({ auth } = await import("./auth"));
    ({ POST: register } = await import("../app/api/auth/register/route"));

    // The existing account, set up the way the real flow leaves it: signed up,
    // code verified, vault + npub stored.
    const res = await register(registerRequest(EXISTING, PASSWORD));
    expect(res.status).toBe(200);
    const confirm = sent.findLast((m) => m.to === EXISTING && m.code);
    expect(confirm?.kind).toBe("confirm");
    const { response } = await auth.api.verifyEmailOTP({
      body: { email: EXISTING, otp: confirm!.code! },
      returnHeaders: true,
    });
    existingId = response.user.id;
    await t.serviceDb
      .updateTable("accounts")
      .set({ npub: EXISTING_NPUB, vault_keys: JSON.stringify({ existing: true }) })
      .where("id", "=", existingId)
      .execute();

    // A sign-up that never entered its code (the sign-in page's resend path).
    expect((await register(registerRequest(UNVERIFIED, PASSWORD))).status).toBe(200);
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(() => {
    sent.length = 0;
  });

  function registerRequest(email: string, password: string): Request {
    return new Request("http://localhost:3001/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }

  async function sessionCount(userId: string): Promise<number> {
    const rows = await t.serviceDb
      .selectFrom("auth_sessions")
      .select("id")
      .where("user_id", "=", userId)
      .execute();
    return rows.length;
  }

  it("still answers { ok: true } (anti-enumeration) and tells the owner by email", async () => {
    const res = await register(registerRequest(EXISTING, OTHER_PASSWORD));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const toOwner = sent.filter((m) => m.to === EXISTING);
    // Bug 1: nothing was sent at all.
    expect(toOwner).toHaveLength(1);
    // A notice that the account exists, never a code.
    expect(toOwner[0].code).toBeUndefined();
  });

  it("resend does not email a confirm code to a verified account", async () => {
    await auth.api.sendVerificationOTP({
      body: { email: EXISTING, type: "email-verification" },
    });
    const codes = sent.filter((m) => m.to === EXISTING && m.code);
    expect(codes).toHaveLength(0);

    const pending = await t.serviceDb
      .selectFrom("auth_verifications")
      .select("id")
      .where("identifier", "like", `email-verification-otp-${EXISTING}%`)
      .execute();
    expect(pending).toHaveLength(0);
  });

  it("the reported flow (register, resend, enter code) never signs in to the existing account", async () => {
    const before = await sessionCount(existingId);

    await register(registerRequest(EXISTING, OTHER_PASSWORD));
    await auth.api.sendVerificationOTP({
      body: { email: EXISTING, type: "email-verification" },
    });
    for (const m of sent.filter((e) => e.to === EXISTING && e.code)) {
      await auth.api.verifyEmailOTP({ body: { email: EXISTING, otp: m.code! } }).catch(() => {});
    }

    expect(await sessionCount(existingId)).toBe(before);
    const account = await t.serviceDb
      .selectFrom("accounts")
      .select(["npub", "vault_keys"])
      .where("id", "=", existingId)
      .executeTakeFirstOrThrow();
    expect(account.npub).toBe(EXISTING_NPUB);
  });

  it("a brand-new address still gets its confirm code", async () => {
    const email = "parent+new@example.com";
    expect((await register(registerRequest(email, PASSWORD))).status).toBe(200);
    const codes = sent.filter((m) => m.to === email && m.code);
    expect(codes).toHaveLength(1);
    expect(codes[0].kind).toBe("confirm");
  });

  it("the notice is the account-exists email, in the account's language", async () => {
    const { accountExistsCopy } = await import("@/emails/strings");
    const email = "parent+deutsch@example.com";
    const id = await t.createAccount(email, { emailVerified: true });
    await t.serviceDb.updateTable("accounts").set({ language: "de" }).where("id", "=", id).execute();

    await register(registerRequest(email, OTHER_PASSWORD));
    expect(sent.filter((m) => m.to === email)).toEqual([
      { to: email, subject: accountExistsCopy("de").subject, code: undefined, kind: undefined },
    ]);
  });

  it("over HTTP, a verified address gets the same answer as an unknown one", async () => {
    const send = (email: string) =>
      auth.handler(
        new Request("http://localhost:3001/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, type: "email-verification" }),
        }),
      );
    const verified = await send(EXISTING);
    const unknown = await send("nobody-here@example.com");
    expect(verified.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await verified.json()).toEqual(await unknown.json());
  });

  it("throttles the notice per account (3 per hour)", async () => {
    const email = "parent+throttle@example.com";
    await t.createAccount(email, { emailVerified: true });
    for (let i = 0; i < 5; i++) {
      await auth.api.sendVerificationOTP({ body: { email, type: "email-verification" } });
    }
    const toOwner = sent.filter((m) => m.to === email);
    expect(toOwner).toHaveLength(3);
    expect(toOwner.every((m) => m.code === undefined)).toBe(true);
  });

  it("an unverified account still gets a confirm code on resend (sign-in page)", async () => {
    await auth.api.sendVerificationOTP({
      body: { email: UNVERIFIED, type: "email-verification" },
    });
    const codes = sent.filter((m) => m.to === UNVERIFIED && m.code);
    expect(codes).toHaveLength(1);
    expect(codes[0].kind).toBe("confirm");
  });
});
