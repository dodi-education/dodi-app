"use client";

import { useDodiContext } from "@/hooks/use-dodi-context";

interface BrowseContextProps {
  profileId: string;
  children: React.ReactNode;
}

/**
 * Wrapper that declares Dodi browse context (compact mode)
 * for pages where Dodi is not the primary interaction.
 */
export function BrowseContext({ profileId, children }: BrowseContextProps) {
  useDodiContext({
    context: { type: "browse" },
    displayMode: "compact",
    profileId,
  });

  return <>{children}</>;
}
