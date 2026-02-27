"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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

export function AIProviderConfig() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [providers, setProviders] = useState<ConfiguredProvider[]>([]);
  const [modelConfig, setModelConfig] = useState<AccountModelConfig | null>(null);
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
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/providers");
      if (response.ok) {
        const data: ProvidersResponse = await response.json();
        setProviders(data.providers);
        setModelConfig(data.modelConfig);
        if (data.modelConfig) {
          setVoiceProvider(data.modelConfig.voiceProvider);
          setVoiceModel(data.modelConfig.voiceModel);
          setVoiceName(data.modelConfig.voiceName);
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
        setModelConfig(data.modelConfig);
        if (data.modelConfig) {
          setVoiceProvider(data.modelConfig.voiceProvider);
          setVoiceModel(data.modelConfig.voiceModel);
          setVoiceName(data.modelConfig.voiceName);
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
      setModelConfig(data.modelConfig);
      if (data.modelConfig) {
        setVoiceProvider(data.modelConfig.voiceProvider);
        setVoiceModel(data.modelConfig.voiceModel);
        setVoiceName(data.modelConfig.voiceName);
      } else {
        setVoiceProvider("");
        setVoiceModel("");
        setVoiceName("");
      }
    }
  }

  async function handleSaveVoiceConfig() {
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
          gameProvider: modelConfig?.gameProvider,
          gameModel: modelConfig?.gameModel,
        }),
      });

      if (res.ok) {
        const data: AccountModelConfig = await res.json();
        setModelConfig(data);
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("aiConfigTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("aiConfigTitle")}</CardTitle>
          <CardDescription>{t("aiConfigDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noProviders")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{provider.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        ...{provider.keyPreview}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t("added", {
                        date: new Date(provider.addedAt).toLocaleDateString(),
                      })}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveProvider(provider.id)}
                    className="cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {t("removeProvider")}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {availableProviders.length > 0 && (
            <>
              {providers.length > 0 && <Separator />}
              <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (!open) resetDialog();
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" className="cursor-pointer w-fit">
                    <Plus className="mr-2 h-4 w-4" />
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
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {validationStatus === "valid" && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        {t("keyValid")}
                      </div>
                    )}

                    {validationStatus === "invalid" && (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4" />
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
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {validating ? t("validating") : t("validating")}
                        </>
                      ) : (
                        t("validateAndSave")
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </CardContent>
      </Card>

      {providers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("voiceConfig")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("voiceProvider")}</Label>
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
                <SelectTrigger className="w-full">
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
            </div>

            {activeProviderDef && (
              <>
                <div className="flex flex-col gap-2">
                  <Label>{t("voiceModel")}</Label>
                  <Select value={voiceModel} onValueChange={setVoiceModel}>
                    <SelectTrigger className="w-full">
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
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{t("voiceName")}</Label>
                  <Select value={voiceName} onValueChange={setVoiceName}>
                    <SelectTrigger className="w-full">
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
                </div>
              </>
            )}

            <Button
              onClick={handleSaveVoiceConfig}
              disabled={!voiceProvider || !voiceModel || !voiceName || configSaving}
              className="cursor-pointer w-fit"
            >
              {configSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tc("save")}
                </>
              ) : configSaved ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t("configSaved")}
                </>
              ) : (
                tc("save")
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
