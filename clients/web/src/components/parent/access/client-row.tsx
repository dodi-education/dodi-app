"use client";

import { useTranslations } from "next-intl";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Icon, type IconName } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AGENT_SCOPE_LABEL_KEYS,
  CLIENT_KIND_KEYS,
  clientDisplayName,
  clientStatusKey,
  type AuthorizedClientView,
  type ClientStatusKey,
} from "@dodi/client-state/authorized-clients";
import { normalizeAgentScopes } from "@dodi/protocol/agent-scopes";
import type { AuthorizedClientKind } from "@dodi/types/database";
import { access } from "@dodi/ui-recipes";

const STATUS_BADGE: Record<ClientStatusKey, "blue" | "success" | "gray"> = {
  statusActive: "success",
  statusPending: "blue",
  statusExpired: "gray",
  statusSignedInOnly: "gray",
};

const KIND_ICON: Record<AuthorizedClientKind, IconName> = {
  browser: "lock",
  app: "lock",
  robot: "qrcode",
  agent: "ai",
};

interface ClientRowProps {
  client: AuthorizedClientView;
  isRevoking: boolean;
  onRevoke: (client: AuthorizedClientView) => void;
}

/** One entry of the Access list: name, kind, status, (agents) scopes and expiry, last use, Revoke. */
export function ClientRow({ client, isRevoking, onRevoke }: ClientRowProps) {
  const t = useTranslations("access");
  const { formatDateTime, formatDate } = useDateFormat();
  const status = clientStatusKey(client);
  const isAgent = client.kind === "agent";
  const scopes = isAgent ? normalizeAgentScopes(client.scopes) : [];
  const name = clientDisplayName(client) || (isAgent ? t("unnamedAgent") : t("unknownDevice"));

  return (
    <Row>
      <div className={cn(access.icon, access.webIcon)}>
        <Icon name={KIND_ICON[client.kind]} size={16} />
      </div>
      <RowMain>
        <RowTitle>
          {name}
          <Badge variant={STATUS_BADGE[status]}>{t(status)}</Badge>
        </RowTitle>
        {isAgent ? (
          <RowMeta>
            {scopes.length > 0
              ? scopes.map((scope) => t(AGENT_SCOPE_LABEL_KEYS[scope].title)).join(", ")
              : t("noScopesGranted")}
          </RowMeta>
        ) : null}
        <RowMeta>
          {t(CLIENT_KIND_KEYS[client.kind])}
          <DotSep />
          {isAgent ? (
            <>
              {client.expires_at
                ? t(status === "statusExpired" ? "expiredOn" : "expiresOn", {
                    date: formatDate(client.expires_at),
                  })
                : t("neverExpires")}
              <DotSep />
            </>
          ) : null}
          {client.last_seen_at
            ? t("lastSeen", { date: formatDateTime(client.last_seen_at) })
            : t("neverSeen")}
        </RowMeta>
      </RowMain>
      {client.status !== "revoked" ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={isRevoking}
          aria-label={`${t("revoke")}: ${name}`}
          onClick={() => onRevoke(client)}
        >
          {isRevoking ? t("revoking") : t("revoke")}
        </Button>
      ) : null}
    </Row>
  );
}
