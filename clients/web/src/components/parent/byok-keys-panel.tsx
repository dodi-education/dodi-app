"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { AI_PROVIDERS } from "@dodi/ai/providers";
import { validateProviderKey } from "@dodi/ai/validate-key";
import { useProvidersStore } from "@/stores/providers-store";
import type { AIProviderId } from "@dodi/types/ai";
import type { DraftModelConfig } from "./capability-model-config";

interface ByokKeysPanelProps {
  /** First key added on an unconfigured account seeds a default voice config. */
  onFirstKeySeeded?: (patch: Partial<DraftModelConfig>) => void;
}

/**
 * The BYOK surface ("Your own keys"): E2EE key list + add/remove. Keys are
 * validated client-side and sealed into the vault — the server never sees
 * them. Managed providers (dodi AI) never appear here: they have no key to
 * paste.
 */
export function ByokKeysPanel({ onFirstKeySeeded }: ByokKeysPanelProps) {
  const t = useTranslations("settings");
  const { formatDate } = useDateFormat();

  const providersMap = useProvidersStore((s) => s.providers);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProviderId | "">("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [validationError, setValidationError] = useState("");
  const [saving, setSaving] = useState(false);

  const providers = Object.entries(providersMap ?? {}).map(([id, entry]) => ({
    id: id as AIProviderId,
    name: AI_PROVIDERS.find((p) => p.id === id)?.name ?? id,
    keyPreview: entry?.keyPreview ?? "",
    addedAt: entry?.addedAt ?? "",
  }));

  const availableProviders = AI_PROVIDERS.filter(
    (p) => !p.isManaged && !providers.some((cp) => cp.id === p.id),
  );

  function resetDialog() {
    setSelectedProvider("");
    setApiKey("");
    setShowKey(false);
    setValidating(false);
    setValidationStatus("idle");
    setValidationError("");
    setSaving(false);
  }

  async function handleValidateAndSave() {
    if (!selectedProvider || !apiKey) return;

    setValidating(true);
    setValidationStatus("idle");
    setValidationError("");

    try {
      const def = AI_PROVIDERS.find((p) => p.id === selectedProvider);
      // Validate with a generateContent-capable model — NOT a Live (voice)
      // model, which only works over the Live WebSocket and 404s generateContent.
      const validateModel =
        (def?.models.find((m) => !m.capabilities.includes("live")) ??
          def?.models[0])?.id ?? "";

      // Validate client-side (server never sees the plaintext key).
      const result = await validateProviderKey(selectedProvider, apiKey, validateModel);
      if (!result.valid) {
        setValidationStatus("invalid");
        setValidationError(result.error || t("keyInvalid"));
        setValidating(false);
        return;
      }

      setValidationStatus("valid");
      setValidating(false);
      setSaving(true);

      const isFirst = Object.keys(providersMap ?? {}).length === 0;
      // Encrypt + store under the vault.
      await useProvidersStore.getState().addKey(selectedProvider, apiKey);

      // First provider → seed a default voice config (model_config is plaintext).
      if (isFirst && def && onFirstKeySeeded) {
        const defaultModel =
          def.models.find((m) => m.capabilities.includes("voice")) ?? def.models[0];
        const defaultVoice = def.voices[0];
        if (defaultModel && defaultVoice) {
          onFirstKeySeeded({
            voiceProvider: selectedProvider,
            voiceModel: defaultModel.id,
            voiceName: defaultVoice.id,
          });
        }
      }

      setDialogOpen(false);
      resetDialog();
    } catch (error) {
      setValidationStatus("invalid");
      setValidationError(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    } finally {
      setValidating(false);
      setSaving(false);
    }
  }

  async function handleRemoveProvider(providerId: AIProviderId) {
    if (!confirm(t("confirmRemoveProvider"))) return;
    try {
      await useProvidersStore.getState().removeKey(providerId);
    } catch {
      // non-critical
    }
  }

  return (
    <Section
      title={t("aiConfigTitle")}
      desc={t("aiConfigDescription")}
      action={
        availableProviders.length > 0 ? (
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="cursor-pointer">
                <Icon name="add" className="h-4 w-4" />
                {t("addProvider")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("addProviderTitle")}</DialogTitle>
                <DialogDescription>{t("addProviderDescription")}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t("selectProvider")}</Label>
                  <Select
                    value={selectedProvider}
                    onValueChange={(value) => {
                      setSelectedProvider(value as AIProviderId);
                      setValidationStatus("idle");
                      setValidationError("");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("selectProvider")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{t("apiKey")}</Label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      placeholder={t("apiKeyPlaceholder")}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setValidationStatus("idle");
                        setValidationError("");
                      }}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                      aria-label={showKey ? "Hide API key" : "Show API key"}
                    >
                      {showKey ? (
                        <Icon name="hide" className="h-4 w-4" />
                      ) : (
                        <Icon name="show" className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {validationStatus === "valid" && (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <Icon name="success" className="h-4 w-4" />
                    {t("keyValid")}
                  </div>
                )}

                {validationStatus === "invalid" && (
                  <div className="flex items-center gap-2 text-sm text-danger">
                    <Icon name="alert" className="h-4 w-4" />
                    {validationError || t("keyInvalid")}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={handleValidateAndSave}
                  disabled={!selectedProvider || !apiKey || validating || saving}
                  className="cursor-pointer"
                >
                  {validating || saving ? (
                    <>
                      <Icon name="loading" className="mr-2 h-4 w-4 animate-spin" />
                      {t("validating")}
                    </>
                  ) : (
                    t("validateAndSave")
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      {providers.length === 0 ? (
        <p className="px-5 py-3.5 text-sm text-muted-foreground">{t("noProviders")}</p>
      ) : (
        providers.map((provider) => (
          <Row key={provider.id}>
            <RowMain>
              <RowTitle>
                {provider.name}
                <Badge variant="key">...{provider.keyPreview}</Badge>
              </RowTitle>
              <RowMeta>
                {t("added", {
                  date: formatDate(provider.addedAt),
                })}
              </RowMeta>
            </RowMain>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveProvider(provider.id)}
              className="cursor-pointer text-danger hover:bg-danger-soft hover:text-danger"
            >
              <Icon name="delete" className="mr-1 h-4 w-4" />
              {t("removeProvider")}
            </Button>
          </Row>
        ))
      )}
    </Section>
  );
}
