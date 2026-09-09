import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * End-to-end check of the Better Auth configuration against a real Postgres
 * (schema validation, snake_case field mapping, uuid ids, the registration
 * gate, OTP delivery, bearer sessions and the custom password endpoints).
 *
 * Needs DATABASE_URL_SERVICE (+ DATABASE_URL_MIGRATOR for the reset) pointing
 * at a database with the baseline applied, e.g. the dev compose stack:
 *   DATABASE_URL_SERVICE=postgres://postgres:pw@127.0.0.1:55432/postgres npx vitest run auth.integration
 * Skipped otherwise.
 */
const DB_URL = process.env.DATABASE_URL_SERVICE;

const sentCodes: Array<{ to: string; code: string; kind: string }> = [];

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (input: { to: string; react: { props: { code: string; kind: string } } }) => {
    sentCodes.push({ to: input.to, code: input.react.props.code, kind: input.react.props.kind });
    return true;
  }),
}));

describe.skipIf(!DB_URL)("Better Auth on Postgres", () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
  process.env.REGISTRATION_MODE = "invite";

  const email = `it-${Date.now()}@example.com`;
  const password = "correct horse battery";
  let token = "";
  let userId = "";

  let auth: typeof import("./auth").auth;
  let register: typeof import("../app/api/auth/register/route").POST;
  let serviceDb: typeof import("./db").serviceDb;

  beforeAll(async () => {
    ({ auth } = await import("./auth"));
    ({ POST: register } = await import("../app/api/auth/register/route"));
    ({ serviceDb } = await import("./db"));
    const existing = await serviceDb
      .selectFrom("invite_codes")
      .select("id")
      .where("code", "=", "IT-CODE")
      .executeTakeFirst();
    if (!existing) {
      await serviceDb
        .insertInto("invite_codes")
        .values({ code: "IT-CODE", note: "integration test" })
        .execute();
    }
  });

  afterAll(async () => {
    const { closeDbPools } = await import("./db");
    await closeDbPools();
  });

  function registerRequest(body: unknown): Request {
    return new Request("http://localhost:3001/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects sign-up without a valid invite code in invite mode", async () => {
    const res = await register(registerRequest({ email, password }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invite code/i);
    const wrong = await register(registerRequest({ email, password, inviteCode: "nope" }));
    expect(wrong.status).toBe(400);
  });

  it("signs up, provisions the account, records the redemption and emails a code", async () => {
    const res = await register(registerRequest({ email, password, inviteCode: "it-code" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const user = await serviceDb
      .selectFrom("auth_users")
      .select(["id", "email_verified", "invite_code"])
      .where("email", "=", email)
      .executeTakeFirstOrThrow();
    userId = user.id;
    expect(user.email_verified).toBe(false);
    expect(user.invite_code).toBe("it-code");
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);

    const account = await serviceDb
      .selectFrom("accounts")
      .select("email")
      .where("id", "=", userId)
      .executeTakeFirst();
    expect(account?.email).toBe(email);

    const redemption = await serviceDb
      .selectFrom("invite_code_redemptions")
      .select("account_id")
      .where("account_id", "=", userId)
      .executeTakeFirst();
    expect(redemption).toBeTruthy();

    expect(sentCodes.at(-1)).toMatchObject({ to: email, kind: "confirm" });
    expect(sentCodes.at(-1)?.code).toMatch(/^\d{6}$/);
  });

  it("answers an existing email with the same success body (anti-enumeration)", async () => {
    const res = await register(registerRequest({ email, password, inviteCode: "it-code" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("refuses password sign-in before verification and re-sends a code", async () => {
    const before = sentCodes.length;
    await expect(
      auth.api.signInEmail({ body: { email, password } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(sentCodes.length).toBe(before + 1);
  });

  it("verifies the OTP and hands out a bearer token", async () => {
    const code = sentCodes.at(-1)!.code;
    const { headers, response } = await auth.api.verifyEmailOTP({
      body: { email, otp: code },
      returnHeaders: true,
    });
    expect(response.user.id).toBe(userId);
    token = headers.get("set-auth-token") ?? "";
    expect(token).not.toBe("");

    const session = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    });
    expect(session?.user.id).toBe(userId);
    expect(session?.user.emailVerified).toBe(true);
  });

  it("signs in with the password once verified", async () => {
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    expect(headers.get("set-auth-token")).toBeTruthy();
  });

  it("verify-password and set-password work on the session", async () => {
    const h = new Headers({ authorization: `Bearer ${token}` });
    const ok = await auth.api.verifyAccountPassword({ body: { password }, headers: h });
    expect(ok).toEqual({ ok: true });
    const bad = await auth.api.verifyAccountPassword({ body: { password: "wrong-password" }, headers: h });
    expect(bad).toEqual({ ok: false });

    await auth.api.setAccountPassword({ body: { password: "new password 123" }, headers: h });
    const after = await auth.api.verifyAccountPassword({ body: { password: "new password 123" }, headers: h });
    expect(after).toEqual({ ok: true });

    // Other sessions were revoked, this one survives.
    const session = await auth.api.getSession({ headers: h });
    expect(session?.user.id).toBe(userId);
    const sessions = await serviceDb
      .selectFrom("auth_sessions")
      .select("id")
      .where("user_id", "=", userId)
      .execute();
    expect(sessions).toHaveLength(1);
  });

  it("OTP sign-in for the reset flow, unknown emails stay silent", async () => {
    const before = sentCodes.length;
    await auth.api.sendVerificationOTP({ body: { email: "nobody@example.com", type: "sign-in" } });
    expect(sentCodes.length).toBe(before);

    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const code = sentCodes.at(-1)!;
    expect(code).toMatchObject({ to: email, kind: "sign-in" });
    const { headers } = await auth.api.signInEmailOTP({
      body: { email, otp: code.code },
      returnHeaders: true,
    });
    expect(headers.get("set-auth-token")).toBeTruthy();
  });

  it("requires a session for the password endpoints", async () => {
    await expect(
      auth.api.verifyAccountPassword({ body: { password }, headers: new Headers() }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
