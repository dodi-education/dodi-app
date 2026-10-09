import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
import { createAgentAccessKey } from "@dodi/client-state/authorized-clients";
import {
  AGENT_SCOPES,
  DEFAULT_AGENT_EXPIRY_DAYS,
  DEFAULT_AGENT_SCOPES,
  type AgentScope,
} from "@dodi/protocol/agent-scopes";
import { access } from "@dodi/ui-recipes";

import { Button, Dialog, Icon, Input, Label, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { accessDeps } from "./access-deps";
import { AgentGrantFields } from "./agent-grant-fields";
import { CopyButton } from "./copy-button";

/**
 * "Create access key" in a modal (web: access/access-key-dialog): this phone
 * derives an agent from a fresh seed, wraps the vault to it and creates it
 * already allowed (no password: the parent is doing it themselves in the
 * unlocked parent area), then shows the key exactly once.
 */
export function AccessKeyDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const { height } = useWindowDimensions();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<AgentScope[]>(() => [...DEFAULT_AGENT_SCOPES]);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(DEFAULT_AGENT_EXPIRY_DAYS);
  const [isCreating, setIsCreating] = useState(false);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close(): void {
    if (isCreating) return;
    setName("");
    setSelected([...DEFAULT_AGENT_SCOPES]);
    setExpiresInDays(DEFAULT_AGENT_EXPIRY_DAYS);
    setAccessKey(null);
    setError(null);
    onClose();
  }

  async function create(): Promise<void> {
    setError(null);
    setIsCreating(true);
    const outcome = await createAgentAccessKey(accessDeps(), { name: name.trim(), scopes: selected, expiresInDays });
    setIsCreating(false);
    if ("error" in outcome) {
      setError(t(outcome.error === "rate_limited" ? "errorRateLimited" : "keyFailed"));
      return;
    }
    setAccessKey(outcome.key);
    onCreated();
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      title={t("keyTitle")}
      description={accessKey ? t("keyCreated") : t("keyDesc")}
      footer={
        accessKey ? (
          <Button onPress={close}>{t("keyDone")}</Button>
        ) : (
          <>
            <Button disabled={isCreating || !name.trim() || selected.length === 0} onPress={() => void create()}>
              {isCreating ? t("creatingKey") : t("createKey")}
            </Button>
            <Button variant="outline" disabled={isCreating} onPress={close}>
              {tc("cancel")}
            </Button>
          </>
        )
      }
    >
      {accessKey ? (
        <View className="gap-3">
          <Text selectable className={access.copyText} accessibilityLabel={t("keyCreated")}>
            {accessKey}
          </Text>
          <CopyButton text={accessKey} label={t("keyCreated")} />
          <View accessibilityRole="alert" className="flex-row items-start gap-1.5">
            <Icon name="alert" size={16} color="warning" />
            <Text className={cn("flex-1", access.warning)}>{t("keyWarning")}</Text>
          </View>
        </View>
      ) : (
        <ScrollView className="-mx-6" style={{ maxHeight: height * 0.5 }} keyboardShouldPersistTaps="handled">
          <View className={access.block}>
            <Label>{t("keyName")}</Label>
            <Input
              accessibilityLabel={t("keyName")}
              value={name}
              onChangeText={setName}
              placeholder={t("keyNamePlaceholder")}
              autoCorrect={false}
              autoComplete="off"
              maxLength={60}
            />
          </View>
          <AgentGrantFields
            scopes={AGENT_SCOPES}
            selected={selected}
            onSelectedChange={setSelected}
            expiresInDays={expiresInDays}
            onExpiresInDaysChange={setExpiresInDays}
          />
          {error ? (
            <Text className={cn("px-5 pt-3", access.error)} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Dialog>
  );
}
