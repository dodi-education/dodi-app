import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { z } from "zod";

const CREDENTIAL_PROVIDER = "credential";

/**
 * Two session-bound password endpoints the web app needs beyond Better Auth's
 * defaults:
 *
 *  POST /api/auth/password/verify { password } → { ok }
 *    Server-side proof of the account password without minting a session. The
 *    parent-PIN "forgot" escape hatch uses it (it used to re-run a full
 *    password sign-in just to check the password).
 *
 *  POST /api/auth/password/set { password }
 *    Replace the credential password of the signed-in user and revoke every
 *    other session. Used by the OTP-verified password reset (the vault re-wrap
 *    runs client-side right after) and by the warm change-password flow.
 *
 * Paths are namespaced under /password because Better Auth ships its own
 * /verify-password and /set-password endpoints with different contracts.
 */
export function passwordOps() {
  return {
    id: "password-ops",
    endpoints: {
      verifyAccountPassword: createAuthEndpoint(
        "/password/verify",
        {
          method: "POST",
          body: z.object({ password: z.string().min(1) }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const accounts = await ctx.context.internalAdapter.findAccounts(userId);
          const credential = accounts.find(
            (a) => a.providerId === CREDENTIAL_PROVIDER && a.password,
          );
          if (!credential?.password) {
            throw new APIError("BAD_REQUEST", {
              message: "This account has no password set.",
            });
          }
          const ok = await ctx.context.password.verify({
            hash: credential.password,
            password: ctx.body.password,
          });
          return ctx.json({ ok });
        },
      ),
      setAccountPassword: createAuthEndpoint(
        "/password/set",
        {
          method: "POST",
          body: z.object({
            password: z.string().min(ctxMinPasswordLength()),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const { session } = ctx.context;
          const userId = session.user.id;
          const min = ctx.context.password.config.minPasswordLength;
          const max = ctx.context.password.config.maxPasswordLength;
          if (ctx.body.password.length < min || ctx.body.password.length > max) {
            throw new APIError("BAD_REQUEST", {
              message: `Password must be between ${min} and ${max} characters.`,
            });
          }
          const hash = await ctx.context.password.hash(ctx.body.password);
          const accounts = await ctx.context.internalAdapter.findAccounts(userId);
          const credential = accounts.find(
            (a) => a.providerId === CREDENTIAL_PROVIDER,
          );
          if (credential) {
            await ctx.context.internalAdapter.updatePassword(userId, hash);
          } else {
            await ctx.context.internalAdapter.linkAccount({
              userId,
              providerId: CREDENTIAL_PROVIDER,
              accountId: userId,
              password: hash,
            });
          }
          const sessions = await ctx.context.internalAdapter.listSessions(userId);
          await Promise.all(
            sessions
              .filter((s) => s.token !== session.session.token)
              .map((s) => ctx.context.internalAdapter.deleteSession(s.token)),
          );
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/** Schema-level floor; the handler re-checks against the configured limits. */
function ctxMinPasswordLength(): number {
  return 8;
}
