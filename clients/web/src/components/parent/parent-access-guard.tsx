"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { isParentPathAllowed, parentHomeFor } from "@dodi/client-state/parent-nav";

import { useAccountStore, useParentAccess } from "@/stores/account-store";

/**
 * Keeps a scoped family member on the pages they were granted: any other
 * parent page sends them to their first one (the platform refuses the data
 * anyway; this spares them a page of errors). Owners and co-parents pass.
 */
export function ParentAccessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const access = useParentAccess();
  const loadAccount = useAccountStore((s) => s.load);
  const isAllowed = isParentPathAllowed(pathname, access);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (!isAllowed) router.replace(parentHomeFor(access));
  }, [isAllowed, access, router]);

  return isAllowed ? <>{children}</> : null;
}
