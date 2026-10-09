import type { ReactNode } from "react";
import { View } from "react-native";
import type { AuthorizedClientView } from "@dodi/client-state/authorized-clients";
import { sectionMessage } from "@dodi/ui-recipes";

import { Section } from "@/components/parent/section";
import { Text } from "@/components/ui";

import { ClientRow } from "./client-row";

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
  action?: ReactNode;
  /** Blocks under the rows (connect forms, sign out). */
  children?: ReactNode;
}

/** One group of the Access list, as a Section card with its rows (web: access/client-section). */
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
  const message = clients === null ? loadingText : clients.length === 0 ? (emptyText ?? null) : null;
  return (
    <Section title={title} desc={desc} action={action}>
      {message ? (
        <View className="px-5 py-6">
          <Text className={sectionMessage.text}>{message}</Text>
        </View>
      ) : null}
      {(clients ?? []).map((client) => (
        <ClientRow key={client.id} client={client} isRevoking={revokingId === client.id} onRevoke={onRevoke} />
      ))}
      {children}
    </Section>
  );
}
