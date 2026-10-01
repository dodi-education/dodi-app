/**
 * The browser's `AuthApi` for the shared sign-in / registration flows
 * (`@dodi/client-state` auth.ts): the Better Auth client plus the platform's
 * own /register and registration-status endpoints.
 */
import type { AuthApi, RegistrationMode } from "@dodi/client-state";

import { dodi } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

export const webAuthApi: AuthApi = {
  signInEmail: (input, headers) => authClient.signIn.email(input, { headers }),
  verifyEmail: (input) => authClient.emailOtp.verifyEmail(input),
  sendVerificationOtp: (input, headers) =>
    authClient.emailOtp.sendVerificationOtp(
      { email: input.email, type: "email-verification" },
      { headers },
    ),
  register: async (input, headers) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(input),
    });
    if (res.ok) return { error: null };
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    return { error: { message: body?.error ?? "", code: body?.code } };
  },
  registrationMode: async () => {
    try {
      const res = await dodi.request("/api/auth/registration-status");
      const data = (await res.json()) as { mode?: RegistrationMode };
      return data.mode ?? "open";
    } catch {
      // The platform's registration gate is the real gate, so failing open for
      // the UI is safe: a closed/invite server still rejects the signup.
      return "open";
    }
  },
  sendSignInOtp: (input, headers) =>
    authClient.emailOtp.sendVerificationOtp({ email: input.email, type: "sign-in" }, { headers }),
  signInEmailOtp: (input) => authClient.signIn.emailOtp(input),
  // POST /api/auth/password/set on the current session (the platform revokes
  // every other session).
  setPassword: async (input) => {
    const { error } = await authClient.$fetch("/password/set", {
      method: "POST",
      body: { password: input.password },
    });
    return { error: error ? { message: error.message, statusText: error.statusText } : null };
  },
  sessionUser: async () => {
    const { data } = await authClient.getSession();
    const user = data?.user;
    return user ? { id: user.id, email: user.email } : null;
  },
};
