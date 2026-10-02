import type { ReactNode } from "react";

import { useDodiContext } from "@/lib/use-dodi-context";

interface BrowseContextProps {
  kidId: string;
  children: ReactNode;
}

/**
 * Declares dodi's browse context (compact mode) for pages where dodi is not
 * the primary interaction (web: components/kid/browse-context).
 */
export function BrowseContext({ kidId, children }: BrowseContextProps) {
  useDodiContext({ context: { type: "browse" }, displayMode: "compact", kidId });
  return <>{children}</>;
}
