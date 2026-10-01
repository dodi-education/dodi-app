/**
 * "Your own keys" (web: parent/byok-keys-panel): the vault's provider keys,
 * add and remove. A key is validated on this device straight with the
 * provider, then sealed into the vault; the server never sees it.
 */
import { useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { validateProviderKey } from "@dodi/ai/validate-key";
import { addableProviders, addProviderKey, byokKeyRows } from "@dodi/client-state/byok-keys";
import type { DraftModelConfig } from "@dodi/client-state/model-config";
import type { AIProviderId } from "@dodi/types/ai";

import { Button, Card, Notice, Text, TextField } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { ChoiceList } from "@/components/ui/choice-list";
import { IconExternalLink, IconTrash } from "@/components/ui/icons";
import { clientState, useProvidersStore } from "@/lib/client-state";
import { useAccountDateFormat } from "@/lib/date-format";
import { SITE_URL } from "@/lib/env";
import { useLocaleSetting } from "@/lib/intl";

/** "How does bring your own key work?" on the marketing site (web: siteUrl("byok")). */
const BYOK_HELP_PATH = { en: "/blog/how-does-byok-work", de: "/de/blog/wie-funktioniert-byok" };

export function ByokKeysPanel({
  onFirstKeySeeded,
}: {
  /** The first key on an unconfigured account seeds a default voice config. */
  onFirstKeySeeded?: (patch: Partial<DraftModelConfig>) => void;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { locale } = useLocaleSetting();
  const { formatDate } = useAccountDateFormat();
  const providersMap = useProvidersStore((s) => s.providers);
  const rows = byokKeyRows(providersMap);
  const available = addableProviders(providersMap);

  const [isAdding, setIsAdding] = useState(false);
  const [providerId, setProviderId] = useState<AIProviderId | "">("");
  const [apiKey, setApiKey] = useState("");
  const [phase, setPhase] = useState<"idle" | "validating" | "saving">("idle");
  const [status, setStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [validationError, setValidationError] = useState("");

  function resetForm(): void {
    setIsAdding(false);
    setProviderId("");
    setApiKey("");
    setPhase("idle");
    setStatus("idle");
    setValidationError("");
  }

  async function validateAndSave(): Promise<void> {
    if (!providerId || !apiKey) return;
    setPhase("validating");
    setStatus("idle");
    setValidationError("");
    const outcome = await addProviderKey(
      { providers: clientState.providers, validateKey: validateProviderKey },
      { providerId, apiKey },
      () => {
        setStatus("valid");
        setPhase("saving");
      },
    );
    if (outcome.kind === "added") {
      if (outcome.seed && onFirstKeySeeded) onFirstKeySeeded(outcome.seed);
      resetForm();
      return;
    }
    setStatus("invalid");
    setValidationError(outcome.kind === "invalid" ? outcome.error || t("keyInvalid") : outcome.error);
    setPhase("idle");
  }

  function confirmRemove(id: AIProviderId): void {
    Alert.alert(t("removeProvider"), t("confirmRemoveProvider"), [
      { text: tc("cancel"), style: "cancel" },
      {
        text: t("removeProvider"),
        style: "destructive",
        onPress: () => void clientState.providers.getState().removeKey(id).catch(() => {}),
      },
    ]);
  }

  const isBusy = phase !== "idle";
  return (
    <Card title={t("aiConfigTitle")} description={t("aiConfigDescription")}>
      {rows.length === 0 ? <Text variant="muted">{t("noProviders")}</Text> : null}
      {rows.map((row) => (
        <View key={row.id} className="flex-row items-center gap-3 border-t border-border pt-3">
          <View className="flex-1 gap-1">
            <Text className="font-semibold">{row.name}</Text>
            <Badge label={`...${row.keyPreview}`} />
            <Text variant="muted">{t("added", { date: formatDate(row.addedAt) })}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("removeProvider")}: ${row.name}`}
            onPress={() => confirmRemove(row.id)}
            className="h-11 w-11 items-center justify-center"
          >
            <IconTrash size={20} color="#BF4F44" />
          </Pressable>
        </View>
      ))}

      {isAdding ? (
        <View className="gap-3 border-t border-border pt-3">
          <Text variant="heading">{t("addProviderTitle")}</Text>
          <Text variant="muted">{t("addProviderDescription")}</Text>
          <ChoiceList
            label={t("selectProvider")}
            choices={available.map((p) => ({ value: p.id, label: p.name }))}
            value={providerId}
            onChange={(id) => {
              setProviderId(id);
              setStatus("idle");
              setValidationError("");
            }}
            disabled={isBusy}
          />
          <TextField
            label={t("apiKey")}
            placeholder={t("apiKeyPlaceholder")}
            value={apiKey}
            onChangeText={(text) => {
              setApiKey(text);
              setStatus("idle");
              setValidationError("");
            }}
            autoCorrect={false}
            secure={{ showLabel: t("showApiKey"), hideLabel: t("hideApiKey") }}
          />
          {status === "valid" ? <Notice tone="success">{t("keyValid")}</Notice> : null}
          {status === "invalid" ? <Notice tone="danger">{validationError || t("keyInvalid")}</Notice> : null}
          <Button
            label={isBusy ? t("validating") : t("validateAndSave")}
            isLoading={isBusy}
            disabled={!providerId || !apiKey}
            onPress={() => void validateAndSave()}
          />
          <Button variant="ghost" label={tc("cancel")} disabled={isBusy} onPress={resetForm} />
        </View>
      ) : available.length > 0 ? (
        <Button variant="secondary" label={t("addProvider")} onPress={() => setIsAdding(true)} />
      ) : null}

      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(`${SITE_URL}${BYOK_HELP_PATH[locale]}`)}
        className="min-h-11 flex-row items-center gap-1.5"
      >
        <Text className="text-sm font-semibold text-primary">{t("byokHelpLink")}</Text>
        <IconExternalLink size={14} color="#2F6BD8" />
      </Pressable>
    </Card>
  );
}
