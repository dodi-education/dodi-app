/**
 * "Your own keys" (web: parent/byok-keys-panel): the vault's provider keys,
 * add and remove. A key is validated on this device straight with the
 * provider, then sealed into the vault; the server never sees it.
 */
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { button } from "@dodi/ui-recipes";
import { validateProviderKey } from "@dodi/ai/validate-key";
import { addableProviders, addProviderKey, byokKeyRows } from "@dodi/client-state/byok-keys";
import type { DraftModelConfig } from "@dodi/client-state/model-config";
import type { AIProviderId } from "@dodi/types/ai";

import { Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Badge, Button, Dialog, Icon, Label, PasswordInput, Select, Text } from "@/components/ui";
import { clientState, useProvidersStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
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

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [providerId, setProviderId] = useState<AIProviderId | "">("");
  const [apiKey, setApiKey] = useState("");
  const [phase, setPhase] = useState<"idle" | "validating" | "saving">("idle");
  const [status, setStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [validationError, setValidationError] = useState("");
  const [removeId, setRemoveId] = useState<AIProviderId | null>(null);

  function resetDialog(): void {
    setProviderId("");
    setApiKey("");
    setPhase("idle");
    setStatus("idle");
    setValidationError("");
  }

  function closeDialog(): void {
    setIsDialogOpen(false);
    resetDialog();
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
      closeDialog();
      return;
    }
    setStatus("invalid");
    setValidationError(outcome.kind === "invalid" ? outcome.error || t("keyInvalid") : outcome.error);
    setPhase("idle");
  }

  function remove(id: AIProviderId): void {
    setRemoveId(null);
    void clientState.providers.getState().removeKey(id).catch(() => {});
  }

  const isBusy = phase !== "idle";
  return (
    <>
      <Section
        title={t("aiConfigTitle")}
        desc={t("aiConfigDescription")}
        action={
          available.length > 0 ? (
            <Button variant="outline" size="sm" icon="add" onPress={() => setIsDialogOpen(true)}>
              {t("addProvider")}
            </Button>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <Text className="px-5 py-3.5 text-sm text-muted-foreground">{t("noProviders")}</Text>
        ) : null}
        {rows.map((row) => (
          <Row key={row.id}>
            <RowMain>
              <RowTitle>
                <RowTitleText>{row.name}</RowTitleText>
                <Badge variant="key">...{row.keyPreview}</Badge>
              </RowTitle>
              <RowMeta>{t("added", { date: formatDate(row.addedAt) })}</RowMeta>
            </RowMain>
            {/* web: ghost sm button recolored text-danger (Button has no icon-color override) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("removeProvider")}: ${row.name}`}
              hitSlop={6}
              onPress={() => setRemoveId(row.id)}
              className={cn(button.box({ variant: "ghost", size: "sm" }), "active:bg-danger-soft")}
            >
              <Icon name="delete" size={16} color="danger" />
              <Text className={cn(button.text({ variant: "ghost", size: "sm" }), "text-danger")}>
                {t("removeProvider")}
              </Text>
            </Pressable>
          </Row>
        ))}
        <Row>
          <Pressable
            accessibilityRole="link"
            hitSlop={14}
            onPress={() => void Linking.openURL(`${SITE_URL}${BYOK_HELP_PATH[locale]}`)}
            className="flex-row items-center gap-1.5 active:opacity-70"
          >
            <Icon name="info" size={16} color="primary" />
            <Text className="text-[13px] font-semibold text-primary">{t("byokHelpLink")}</Text>
            <Icon name="external" size={14} color="primary" />
          </Pressable>
        </Row>
      </Section>

      <Dialog
        isOpen={isDialogOpen}
        onClose={closeDialog}
        title={t("addProviderTitle")}
        description={t("addProviderDescription")}
        footer={
          <Button
            isLoading={isBusy}
            disabled={!providerId || !apiKey}
            onPress={() => void validateAndSave()}
          >
            {isBusy ? t("validating") : t("validateAndSave")}
          </Button>
        }
      >
        <View className="flex-col gap-4">
          <View className="flex-col gap-2">
            <Label>{t("selectProvider")}</Label>
            <Select<AIProviderId | "">
              label={t("selectProvider")}
              value={providerId}
              options={available.map((p) => ({ value: p.id, label: p.name }))}
              onValueChange={(id) => {
                setProviderId(id);
                setStatus("idle");
                setValidationError("");
              }}
              disabled={isBusy}
            />
          </View>
          <View className="flex-col gap-2">
            <Label>{t("apiKey")}</Label>
            <PasswordInput
              showPasswordLabel={t("showApiKey")}
              hidePasswordLabel={t("hideApiKey")}
              accessibilityLabel={t("apiKey")}
              placeholder={t("apiKeyPlaceholder")}
              value={apiKey}
              onChangeText={(text) => {
                setApiKey(text);
                setStatus("idle");
                setValidationError("");
              }}
            />
          </View>
          {status === "valid" ? (
            <View className="flex-row items-center gap-2">
              <Icon name="success" size={16} color="success" />
              <Text className="min-w-0 flex-1 text-sm text-success">{t("keyValid")}</Text>
            </View>
          ) : null}
          {status === "invalid" ? (
            <View className="flex-row items-center gap-2" accessibilityRole="alert">
              <Icon name="alert" size={16} color="danger" />
              <Text className="min-w-0 flex-1 text-sm text-danger">{validationError || t("keyInvalid")}</Text>
            </View>
          ) : null}
        </View>
      </Dialog>

      {/* web: window.confirm(confirmRemoveProvider) */}
      <Dialog
        isOpen={removeId !== null}
        onClose={() => setRemoveId(null)}
        title={t("removeProvider")}
        description={t("confirmRemoveProvider")}
        footer={
          <>
            <Button variant="destructive" onPress={() => removeId && remove(removeId)}>
              {t("removeProvider")}
            </Button>
            <Button variant="outline" onPress={() => setRemoveId(null)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </>
  );
}
