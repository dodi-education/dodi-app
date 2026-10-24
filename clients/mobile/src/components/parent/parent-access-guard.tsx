import { type Href, Redirect, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { isParentPathAllowed, parentHomeFor } from "@dodi/client-state/parent-nav";

import { useAccountStore, useParentAccess } from "@/lib/client-state";

/**
 * Keeps a scoped family member on the pages they were granted (web:
 * components/parent/parent-access-guard): any other parent page sends them to
 * their first one. Owners and co-parents pass.
 */
export function ParentAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const access = useParentAccess();
  const loadAccount = useAccountStore((s) => s.load);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  if (!isParentPathAllowed(pathname, access)) return <Redirect href={parentHomeFor(access) as Href} />;
  return <>{children}</>;
}
