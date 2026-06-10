"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import {
  FieldRow,
  Row,
  RowMain,
  RowMeta,
  RowTitle,
  StackField,
} from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { AI_PROVIDERS } from "@/lib/ai/providers";
import type { AIProviderId, AccountModelConfig, ConfiguredProvider } from "@/types/ai";

interface ProvidersResponse {
  providers: ConfiguredProvider[];
  modelConfig: AccountModelConfig | null;
}

const THINKING_PROVIDER_FALLBACK = "__fallback__";

export function AIProviderConfig() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [providers, setProviders] = useState<ConfiguredProvider[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProviderId | "">("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [validationError, setValidationError] = useState("");
  const [saving, setSaving] = useState(false);

  // Voice config state
  const [voiceProvider, setVoiceProvider] = useState<AIProviderId | "">("");
  const [voiceModel, setVoiceModel] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [thinkingProvider, setThinkingProvider] = useState<AIProviderId | "">("");
  const [thinkingModel, setThinkingModel] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/providers");
      if (response.ok) {
        const data: ProvidersResponse = await response.json();
        setProviders(data.providers);
        if (data.modelConfig) {
          setVoiceProvider(data.modelConfig.voiceProvider);
          setVoiceModel(data.modelConfig.voiceModel);
          setVoiceName(data.modelConfig.voiceName);
          // Support both old (gameProvider) and new (thinkingProvider) shapes
          setThinkingProvider(data.modelConfig.thinkingProvider ?? data.modelConfig.gameProvider ?? "");
          setThinkingModel(data.modelConfig.thinkingModel ?? data.modelConfig.gameModel ?? "");
        } else {
          setVoiceProvider("");
          setVoiceModel("");
          setVoiceName("");
          setThinkingProvider("");
          setThinkingModel("");
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

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

    // Step 1: Validate the key
    setValidating(true);
    setValidationStatus("idle");
    setValidationError("");

    try {
      const validateRes = await fetch("/api/ai/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider, apiKey }),
      });

      const validateData = await validateRes.json();

      if (!validateData.valid) {
        setValidationStatus("invalid");
        setValidationError(validateData.error || t("keyInvalid"));
        setValidating(false);
        return;
      }

      setValidationStatus("valid");
      setValidating(false);

      // Step 2: Save the provider
      setSaving(true);
      const saveRes = await fetch("/api/ai/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider, apiKey }),
      });

      if (saveRes.ok) {
        const data: ProvidersResponse = await saveRes.json();
        setProviders(data.providers);
        if (data.modelConfig) {
          setVoiceProvider(data.modelConfig.voiceProvider);
          setVoiceModel(data.modelConfig.voiceModel);
          setVoiceName(data.modelConfig.voiceName);
          setThinkingProvider(data.modelConfig.thinkingProvider ?? data.modelConfig.gameProvider ?? "");
          setThinkingModel(data.modelConfig.thinkingModel ?? data.modelConfig.gameModel ?? "");
        } else {
          setVoiceProvider("");
          setVoiceModel("");
          setVoiceName("");
          setThinkingProvider("");
          setThinkingModel("");
        }
        setDialogOpen(false);
        resetDialog();
      } else {
        const errorData = await saveRes.json().catch(() => ({ error: "Failed to save provider" }));
        setValidationStatus("invalid");
        setValidationError(errorData.error || "Failed to save provider");
      }
    } catch {
      setValidationStatus("invalid");
      setValidationError("An unexpected error occurred");
    } finally {
      setValidating(false);
      setSaving(false);
    }
  }

  async function handleRemoveProvider(providerId: AIProviderId) {
    if (!confirm(t("confirmRemoveProvider"))) return;

    const res = await fetch("/api/ai/providers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: providerId }),
    });

    if (res.ok) {
      const data: ProvidersResponse = await res.json();
      setProviders(data.providers);
      if (data.modelConfig) {
        setVoiceProvider(data.modelConfig.voiceProvider);
        setVoiceModel(data.modelConfig.voiceModel);
        setVoiceName(data.modelConfig.voiceName);
        setThinkingProvider(data.modelConfig.thinkingProvider ?? data.modelConfig.gameProvider ?? "");
        setThinkingModel(data.modelConfig.thinkingModel ?? data.modelConfig.gameModel ?? "");
      } else {
        setVoiceProvider("");
        setVoiceModel("");
        setVoiceName("");
        setThinkingProvider("");
        setThinkingModel("");
      }
    }
  }

  async function handleSaveConfig() {
    if (!voiceProvider || !voiceModel || !voiceName) return;

    setConfigSaving(true);
    setConfigSaved(false);

    try {
      const res = await fetch("/api/ai/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceProvider,
          voiceModel,
          voiceName,
          thinkingProvider: thinkingProvider || undefined,
          thinkingModel: thinkingProvider ? thinkingModel : undefined,
        }),
      });

      if (res.ok) {
        const data: AccountModelConfig = await res.json();
        setThinkingProvider(data.thinkingProvider ?? "");
        setThinkingModel(data.thinkingModel ?? "");
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 2000);
      }
    } finally {
      setConfigSaving(false);
    }
  }

  // Available providers not yet configured
  const availableProviders = AI_PROVIDERS.filter(
    (p) => !providers.some((cp) => cp.id === p.id),
  );

  // Get models/voices for the selected voice provider
  const activeProviderDef = AI_PROVIDERS.find((p) => p.id === voiceProvider);
  const activeThinkingProviderDef = AI_PROVIDERS.find((p) => p.id === thinkingProvider);
  const voiceFallbackText = voiceProvider && voiceModel
    ? `${voiceProvider} / ${voiceModel}`
    : t("gameModelFallbackMissingVoice");

  if (loading) {
    return (
      <Section title={t("aiConfigTitle")}>
        <div className="flex items-center gap-2 px-5 py-3.5 text-sm text-muted-foreground">
          <Icon name="loading" className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </Section>
    );
  }

  return (
    <>
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
                  <DialogDescription>
                    {t("addProviderDescription")}
                  </DialogDescription>
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
                        {validating ? t("validating") : t("validating")}
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
          <p className="px-5 py-3.5 text-sm text-muted-foreground">
            {t("noProviders")}
          </p>
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
                    date: new Date(provider.addedAt).toLocaleDateString(),
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

      {providers.length > 0 && (
        <>
          <Section title={t("voiceConfig")} desc={t("voiceConfigDescription")}>
            <FieldRow label={t("voiceProvider")}>
              <Select
                value={voiceProvider}
                onValueChange={(value) => {
                  const pid = value as AIProviderId;
                  setVoiceProvider(pid);
                  // Reset model/voice to first available
                  const def = AI_PROVIDERS.find((p) => p.id === pid);
                  if (def) {
                    setVoiceModel(def.models[0]?.id ?? "");
                    setVoiceName(def.voices[0]?.id ?? "");
                  }
                }}
              >
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            {activeProviderDef && (
              <>
                <FieldRow label={t("voiceModel")}>
                  <Select value={voiceModel} onValueChange={setVoiceModel}>
                    <SelectTrigger className="w-full sm:w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeProviderDef.models
                        .filter((m) => m.capabilities.includes("voice"))
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label={t("voiceName")}>
                  <Select value={voiceName} onValueChange={setVoiceName}>
                    <SelectTrigger className="w-full sm:w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeProviderDef.voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              </>
            )}
          </Section>

          <Section title={t("thinkingModel")}>
            <FieldRow label={t("thinkingProvider")}>
              <Select
                value={thinkingProvider || THINKING_PROVIDER_FALLBACK}
                onValueChange={(value) => {
                  if (value === THINKING_PROVIDER_FALLBACK) {
                    setThinkingProvider("");
                    setThinkingModel("");
                    return;
                  }

                  const providerId = value as AIProviderId;
                  setThinkingProvider(providerId);

                  const providerDef = AI_PROVIDERS.find((provider) => provider.id === providerId);
                  const defaultModel = providerDef?.models.find((model) => model.capabilities.includes("thinking"));
                  setThinkingModel(defaultModel?.id ?? "");
                }}
              >
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={THINKING_PROVIDER_FALLBACK}>
                    {t("thinkingProviderFallback")}
                  </SelectItem>
                  {providers
                    .filter((provider) => {
                      const def = AI_PROVIDERS.find((p) => p.id === provider.id);
                      return def?.supportsThinking;
                    })
                    .map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FieldRow>

            {!thinkingProvider ? (
              <StackField>
                <p className="text-[12.5px] text-muted-foreground">
                  {t("thinkingModelFallbackHint", { voiceModel: voiceFallbackText })}
                </p>
              </StackField>
            ) : activeThinkingProviderDef ? (
              <FieldRow label={t("thinkingModel")}>
                <Select value={thinkingModel} onValueChange={setThinkingModel}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeThinkingProviderDef.models
                      .filter((model) => model.capabilities.includes("thinking"))
                      .map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            ) : null}

            <SaveRow note={configSaved ? t("configSaved") : undefined}>
              <Button
                onClick={handleSaveConfig}
                disabled={
                  !voiceProvider ||
                  !voiceModel ||
                  !voiceName ||
                  configSaving ||
                  (Boolean(thinkingProvider) && !thinkingModel)
                }
                className="cursor-pointer"
              >
                {configSaving ? (
                  <>
                    <Icon name="loading" className="mr-2 h-4 w-4 animate-spin" />
                    {tc("save")}
                  </>
                ) : (
                  tc("save")
                )}
              </Button>
            </SaveRow>
          </Section>
        </>
      )}
    </>
  );
}
