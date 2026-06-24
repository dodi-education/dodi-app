"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

function Signing() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}

/**
 * OAuth callback (client-side PKCE). The browser Supabase client auto-exchanges
 * the `?code=` param on load (`detectSessionInUrl`); we listen for the resulting
 * sign-in (or an already-present session) and forward to `next`. A short
 * fallback bounces back to login if the exchange never completes.
 */
function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const next = params.get("next") ?? "/parent/dashboard";
    const supabase = createClient();
    let done = false;

    const go = (path: string) => {
      if (done) return;
      done = true;
      router.replace(path);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go(next);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) go(next);
    });

    const timer = setTimeout(() => {
      go("/login?error=auth_callback_failed");
    }, 5000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [params, router]);

  return <Signing />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Signing />}>
      <AuthCallback />
    </Suspense>
  );
}
