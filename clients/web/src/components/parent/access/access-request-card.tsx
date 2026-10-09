"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { accessDeps } from "@/components/parent/access/access-deps";
import { AgentGrantFields } from "@/components/parent/access/agent-grant-fields";
import { FieldRow } from "@/components/parent/rows";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ALLOW_ERROR_KEYS,
  allowAccessRequest,
  declineAccessRequest,
  initialAgentScopes,
  type AccessRequest,
} from "@dodi/client-state/authorized-clients";
import { DEFAULT_AGENT_EXPIRY_DAYS, type AgentScope } from "@dodi/protocol/agent-scopes";
import { access, section } from "@dodi/ui-recipes";

interface AccessRequestCardProps {
  request: AccessRequest;
  /** Called once the parent decided; `isAllowed` says which way. */
  onDone: (isAllowed: boolean) => void;
}

/**
 * "Allow access" for a claimed robot or agent: who asks (name + fingerprint
 * to compare with the client), for an agent what it may do and for how long,
 * then Allow. Allowing wraps the vault key to the client here.
 */
export function AccessRequestCard({ request, onDone }: AccessRequestCardProps) {
  const t = useTranslations("access");
  const isAgent = request.kind === "agent";
  const [selected, setSelected] = useState<AgentScope[]>(() =>
    initialAgentScopes(request.requestedScopes),
  );
  const [expiresInDays, setExpiresInDays] = useState<number | null>(DEFAULT_AGENT_EXPIRY_DAYS);
  const [busy, setBusy] = useState<"allow" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = request.name || (isAgent ? t("unnamedAgent") : t("unknownDevice"));

  async function allow(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("allow");
    const outcome = await allowAccessRequest(accessDeps(), request, {
      grant: isAgent ? { scopes: selected, expiresInDays } : undefined,
    });
    setBusy(null);
    if (outcome === "ok") onDone(true);
    else setError(t(ALLOW_ERROR_KEYS[outcome]));
  }

  async function decline() {
    setError(null);
    setBusy("decline");
    const isOk = await declineAccessRequest(accessDeps(), request);
    setBusy(null);
    if (isOk) onDone(false);
    else setError(t("declineFailed"));
  }

  return (
    <form onSubmit={allow} aria-labelledby="access-request-title" className={section.web}>
      <div className={cn("flex", access.header)}>
        <div className={cn(access.icon, access.webIcon)}>
          <Icon name={isAgent ? "ai" : "qrcode"} size={16} />
        </div>
        <h3 id="access-request-title" className={access.title}>
          {t("requestTitle", { name })}
        </h3>
      </div>
      <FieldRow
        label={t("fingerprint")}
        hint={t(isAgent ? "fingerprintHintAgent" : "fingerprintHintRobot")}
      >
        <code className={access.code}>{request.fingerprint}</code>
      </FieldRow>
      {isAgent ? (
        <AgentGrantFields
          idPrefix="allow"
          scopes={request.requestedScopes}
          selected={selected}
          onSelectedChange={setSelected}
          expiresInDays={expiresInDays}
          onExpiresInDaysChange={setExpiresInDays}
        />
      ) : null}
      <div className={cn("flex", access.block)}>
        <p className={access.note}>{t(isAgent ? "decryptNote" : "robotNote")}</p>
        {isAgent && selected.length === 0 ? <p className={access.note}>{t("noScopes")}</p> : null}
        {error ? (
          <p role="alert" className={access.error}>
            {error}
          </p>
        ) : null}
        <div className={cn(access.actions, access.webActions)}>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy !== null}
            onClick={() => void decline()}
          >
            {busy === "decline" ? t("declining") : t("decline")}
          </Button>
          <Button
            type="submit"
            className="min-h-11"
            disabled={busy !== null || (isAgent && selected.length === 0)}
          >
            {busy === "allow" ? t("allowing") : t("allow")}
          </Button>
        </div>
      </div>
    </form>
  );
}
