"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SignOutButton } from "@/components/parent/sign-out-button";
import { dodi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

/** Client-side account badge: email from the browser session, tier from the API. */
export function AccountBadge() {
  const t = useTranslations("settings");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("free");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? ""))
      .catch(() => {});
    dodi
      .request("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.account?.subscribed_plan) setTier(d.account.subscribed_plan);
      })
      .catch(() => {});
  }, []);

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
