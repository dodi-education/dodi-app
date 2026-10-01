/**
 * Sign-in session for the app. Bearer-only, as on the web: the platform's
 * Better Auth bearer plugin hands the session token out in the
 * `set-auth-token` response header, and every platform, auth and dodi AI
 * request sends it back as `Authorization: Bearer …`. The token lives in the
 * Keychain / Keystore, mirrored in memory for synchronous reads.
 */
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import type { AuthApi, RegistrationMode } from "@dodi/client-state";

import { API_URL } from "@/lib/env";

import { cookielessFetch } from "./http";

const TOKEN_KEY = "dodi.auth-token";
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let token = "";

/** Read the stored token into memory; call once before anything signs requests. */
export async function loadAccessToken(): Promise<string> {
  token = (await SecureStore.getItemAsync(TOKEN_KEY, SECURE_OPTIONS)) ?? "";
  return token;
}

/** The current bearer, or "" when signed out. Synchronous. */
export function getAccessToken(): string {
  return token;
}

function storeAccessToken(next: string): void {
  token = next;
  void SecureStore.setItemAsync(TOKEN_KEY, next, SECURE_OPTIONS);
}

export async function clearAccessToken(): Promise<void> {
  token = "";
  await SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_OPTIONS);
}

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [emailOTPClient()],
  fetchOptions: {
    customFetchImpl: cookielessFetch,
    credentials: "omit",
    auth: { type: "Bearer", token: () => getAccessToken() },
    onSuccess: (ctx) => {
      const issued = ctx.response.headers.get("set-auth-token");
      if (issued) storeAccessToken(issued);
    },
  },
});

/** Revoke the server session (best effort) and always drop the local token. */
export async function signOut(): Promise<void> {
  try {
    await authClient.signOut();
  } catch {
    // The local token is what gates this device.
  } finally {
    await clearAccessToken();
  }
}

/** The app's `AuthApi` for the shared sign-in / registration flows. */
export const mobileAuthApi: AuthApi = {
  signInEmail: (input, headers) => authClient.signIn.email(input, { headers }),
  verifyEmail: (input) => authClient.emailOtp.verifyEmail(input),
  sendVerificationOtp: (input, headers) =>
    authClient.emailOtp.sendVerificationOtp(
      { email: input.email, type: "email-verification" },
      { headers },
    ),
  register: async (input, headers) => {
    const res = await cookielessFetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(input),
    });
    if (res.ok) return { error: null };
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    return { error: { message: body?.error ?? "", code: body?.code } };
  },
  registrationMode: async () => {
    try {
      const res = await cookielessFetch(`${API_URL}/api/auth/registration-status`);
      const data = (await res.json()) as { mode?: RegistrationMode };
      return data.mode ?? "open";
    } catch {
      // The platform's gate is the real gate; failing open in the UI is safe.
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
