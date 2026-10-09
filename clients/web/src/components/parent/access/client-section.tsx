"use client";

import { ClientRow } from "@/components/parent/access/client-row";
import { Section } from "@/components/parent/section";
import type { AuthorizedClientView } from "@dodi/client-state/authorized-clients";
import { sectionMessage } from "@dodi/ui-recipes";

interface ClientSectionProps {
  title: string;
  desc?: string;
  /** null while loading. */
  clients: AuthorizedClientView[] | null;
  loadingText: string;
  /** Shown when the group is empty; omit to show nothing. */
  emptyText?: string;
  revokingId: string | null;
  onRevoke: (client: AuthorizedClientView) => void;
  /** The header's action button (as on the Companions page). */
  action?: React.ReactNode;
  /** Blocks under the rows (connect forms, sign out). */
  children?: React.ReactNode;
}

/** One group of the Access list, as a Section card with its rows. */
export function ClientSection({
  title,
  desc,
  clients,
  loadingText,
  emptyText,
  revokingId,
  onRevoke,
  action,
  children,
}: ClientSectionProps) {
  const message =
    clients === null ? loadingText : clients.length === 0 ? (emptyText ?? null) : null;
  return (
    <Section title={title} desc={desc} action={action}>
      {message ? (
        <div className="px-5 py-6">
          <p className={sectionMessage.text}>{message}</p>
        </div>
      ) : null}
      {(clients ?? []).map((client) => (
        <ClientRow
          key={client.id}
          client={client}
          isRevoking={revokingId === client.id}
          onRevoke={onRevoke}
        />
      ))}
      {children}
    </Section>
  );
}
