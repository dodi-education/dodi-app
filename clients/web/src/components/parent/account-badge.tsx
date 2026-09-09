"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { SignOutButton } from "@/components/parent/sign-out-button";
import { authClient } from "@/lib/auth/client";
import { useAccountStore } from "@/stores/account-store";

/**
 * Client-side account badge: email from the shared auth session (one
 * /get-session fetch app-wide, cached by the auth client), tier from the
 * shared account store (one /api/account fetch app-wide).
 */
export function AccountBadge() {
  const t = useTranslations("settings");
  const { data: session } = authClient.useSession();
  const email = session?.user.email ?? "";
  const tier = useAccountStore((s) => s.account?.subscribed_plan ?? "egg");
  const loadAccount = useAccountStore((s) => s.load);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const initial = (email[0] ?? "?").toUpperCase();

  return (
    <div className="flex items-center gap-2 border-t pt-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft-2 text-xs font-bold text-primary">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold">{email}</div>
        <div className="text-[11.5px] text-muted-foreground">
          {t("tierLabel", {
            tier: tier.charAt(0).toUpperCase() + tier.slice(1),
          })}
        </div>
      </div>
      <SignOutButton />
    </div>
  );
}
