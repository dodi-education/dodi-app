import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  ALLOW_ERROR_KEYS,
  allowAccessRequest,
  declineAccessRequest,
  initialAgentScopes,
  type AccessRequest,
} from "@dodi/client-state/authorized-clients";
import { DEFAULT_AGENT_EXPIRY_DAYS, type AgentScope } from "@dodi/protocol/agent-scopes";
import { access, section } from "@dodi/ui-recipes";

import { FieldRow } from "@/components/parent/rows";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { accessDeps } from "./access-deps";
import { AgentGrantFields } from "./agent-grant-fields";

interface AccessRequestCardProps {
  request: AccessRequest;
  /** Called once the parent decided; `isAllowed` says which way. */
  onDone: (isAllowed: boolean) => void;
}

/**
 * "Allow access" for a claimed robot or agent (web: access/access-request-card):
 * who asks (name + fingerprint), for an agent what it may do and for how long,
 * then Allow. Allowing wraps the vault key to it on this phone.
 */
export function AccessRequestCard({ request, onDone }: AccessRequestCardProps) {
  const t = useTranslations("access");
  const isAgent = request.kind === "agent";
  const [selected, setSelected] = useState<AgentScope[]>(() => initialAgentScopes(request.requestedScopes));
  const [expiresInDays, setExpiresInDays] = useState<number | null>(DEFAULT_AGENT_EXPIRY_DAYS);
  const [busy, setBusy] = useState<"allow" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = request.name || (isAgent ? t("unnamedAgent") : t("unknownDevice"));

  async function allow(): Promise<void> {
    setError(null);
    setBusy("allow");
    const outcome = await allowAccessRequest(accessDeps(), request, {
      grant: isAgent ? { scopes: selected, expiresInDays } : undefined,
    });
    setBusy(null);
    if (outcome === "ok") onDone(true);
    else setError(t(ALLOW_ERROR_KEYS[outcome]));
  }

  async function decline(): Promise<void> {
    setError(null);
    setBusy("decline");
    const isOk = await declineAccessRequest(accessDeps(), request);
    setBusy(null);
    if (isOk) onDone(false);
    else setError(t("declineFailed"));
  }

  return (
    <View>
      <View className={access.header}>
        <View className={access.icon}>
          <Icon name={isAgent ? "ai" : "qrcode"} size={16} color="primary" />
        </View>
        <Text className={access.title} accessibilityRole="header">
          {t("requestTitle", { name })}
        </Text>
      </View>
      <FieldRow
        label={t("fingerprint")}
        hint={t(isAgent ? "fingerprintHintAgent" : "fingerprintHintRobot")}
        className={section.divider}
      >
        <Text selectable className={access.code}>
          {request.fingerprint}
        </Text>
      </FieldRow>
      {isAgent ? (
        <AgentGrantFields
          scopes={request.requestedScopes}
          selected={selected}
          onSelectedChange={setSelected}
          expiresInDays={expiresInDays}
          onExpiresInDaysChange={setExpiresInDays}
        />
      ) : null}
      <View className={cn(access.block, section.divider)}>
        <Text className={access.note}>{t(isAgent ? "decryptNote" : "robotNote")}</Text>
        {isAgent && selected.length === 0 ? <Text className={access.note}>{t("noScopes")}</Text> : null}
        {error ? (
          <Text className={access.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View className={access.actions}>
          <Button variant="outline" disabled={busy !== null} onPress={() => void decline()}>
            {busy === "decline" ? t("declining") : t("decline")}
          </Button>
          <Button
            disabled={busy !== null || (isAgent && selected.length === 0)}
            onPress={() => void allow()}
          >
            {busy === "allow" ? t("allowing") : t("allow")}
          </Button>
        </View>
      </View>
    </View>
  );
}
