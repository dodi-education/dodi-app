"use client";

import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  defaultModelFor,
  type DraftModelConfig,
  isDraftSavable,
  type ModelCapability as Capability,
  modelOptionsFor as modelOptions,
  providerOptionsFor,
  voiceOptionsFor,
  voiceProviderPatch,
} from "@dodi/client-state/model-config";
import type { AIProviderId } from "@dodi/types/ai";

export { type DraftModelConfig, EMPTY_DRAFT } from "@dodi/client-state/model-config";

const PROVIDER_NONE = "__none__";

interface CapabilityModelConfigProps {
  config: DraftModelConfig;
  onChange: (patch: Partial<DraftModelConfig>) => void;
  /** Configured BYOK providers (from the vault). */
  byokProviders: { id: AIProviderId; name: string }[];
  /** dodi AI is active → offer "dodi AI (recommended)" in every dropdown. */
  dodiSelectable: boolean;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

/**
 * The four per-capability provider/model pickers (Voice / Thinking / Game
 * generation / Image). Per-category provider choice is how dodi AI combines
 * with BYOK: each dropdown lists "dodi AI (recommended)" (when active) plus
 * the capability-supporting BYOK providers. dodi's "default" pseudo-model
 * renders with the platform-resolved model name.
 */
export function CapabilityModelConfig({
  config,
  onChange,
  byokProviders,
  dodiSelectable,
  onSave,
  saving,
  saved,
}: CapabilityModelConfigProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  // User-facing dodi AI naming is by SERVICE (category), not model: under
  // dodi AI each category always runs the platform default model (the
  // "default" sentinel) and shows a static service name instead of a model
  // picker. The per-model plumbing stays intact for a later re-enable.
  const serviceLabel: Record<"voice" | "thinking" | "game" | "image", string> = {
    voice: t("serviceVoice"),
    thinking: t("serviceThinking"),
    game: t("serviceCode"),
    image: t("serviceImage"),
  };

  function providerOptions(capability: Capability) {
    return providerOptionsFor(
      capability,
      byokProviders,
      dodiSelectable ? t("managedProviderOption") : null,
    );
  }

  const categories = [
    {
      key: "thinking" as const,
      capability: "thinking" as Capability,
      title: t("thinkingModel"),
      desc: t("thinkingModelDescription"),
      providerLabel: t("thinkingProvider"),
      modelLabelText: t("thinkingModel"),
      fallbackLabel: t("thinkingProviderFallback"),
      provider: config.thinkingProvider,
      model: config.thinkingModel,
      set: (provider: AIProviderId | "", model: string) =>
        onChange({ thinkingProvider: provider, thinkingModel: model }),
    },
    {
      key: "game" as const,
      capability: "agentic" as Capability,
      title: t("gameConfig"),
      desc: t("gameConfigDescription"),
      providerLabel: t("gameProvider"),
      modelLabelText: t("gameModel"),
      fallbackLabel: t("gameProviderFallback"),
      provider: config.gameProvider,
      model: config.gameModel,
      set: (provider: AIProviderId | "", model: string) =>
        onChange({ gameProvider: provider, gameModel: model }),
    },
    {
      key: "image" as const,
      capability: "image" as Capability,
      title: t("imageConfig"),
      desc: t("imageConfigDescription"),
      providerLabel: t("imageProvider"),
      modelLabelText: t("imageModel"),
      fallbackLabel: t("imageProviderFallback"),
      provider: config.imageProvider,
      model: config.imageModel,
      set: (provider: AIProviderId | "", model: string) =>
        onChange({ imageProvider: provider, imageModel: model }),
    },
  ];

  const voices = voiceOptionsFor(config.voiceProvider);
  const voiceProviders = providerOptions("voice");

  return (
    <>
      <Section title={t("voiceConfig")} desc={t("voiceConfigDescription")}>
        <FieldRow label={t("voiceProvider")}>
          <Select
            value={config.voiceProvider}
            onValueChange={(value) => onChange(voiceProviderPatch(value as AIProviderId))}
          >
            <SelectTrigger className="w-full sm:w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {voiceProviders.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        {voices && (
          <>
            {config.voiceProvider === "dodi" ? (
              <FieldRow label={t("voiceModel")}>
                <span className="text-sm text-muted-foreground">{serviceLabel.voice}</span>
              </FieldRow>
            ) : (
              <FieldRow label={t("voiceModel")}>
                <Select
                  value={config.voiceModel}
                  onValueChange={(v) => onChange({ voiceModel: v })}
                >
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions(config.voiceProvider, "voice").map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            )}

            <FieldRow label={t("voiceName")}>
              <Select
                value={config.voiceName}
                onValueChange={(v) => onChange({ voiceName: v })}
              >
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
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

      {categories.map((cat, index) => {
        const options = providerOptions(cat.capability);
        const isLast = index === categories.length - 1;
        return (
          <Section key={cat.key} title={cat.title} desc={cat.desc}>
            <FieldRow label={cat.providerLabel}>
              <Select
                value={cat.provider || PROVIDER_NONE}
                onValueChange={(value) => {
                  if (value === PROVIDER_NONE) {
                    cat.set("", "");
                    return;
                  }
                  const pid = value as AIProviderId;
                  cat.set(pid, defaultModelFor(pid, cat.capability));
                }}
              >
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PROVIDER_NONE}>{cat.fallbackLabel}</SelectItem>
                  {options.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            {cat.provider === "dodi" ? (
              <FieldRow label={cat.modelLabelText}>
                <span className="text-sm text-muted-foreground">{serviceLabel[cat.key]}</span>
              </FieldRow>
            ) : cat.provider ? (
              <FieldRow label={cat.modelLabelText}>
                <Select
                  value={cat.model}
                  onValueChange={(v) => cat.set(cat.provider, v)}
                >
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions(cat.provider, cat.capability).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            ) : null}

            {isLast ? (
              <SaveRow note={saved ? t("configSaved") : undefined}>
                <Button
                  onClick={onSave}
                  disabled={!isDraftSavable(config) || saving}
                  className="cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Icon name="loading" className="mr-2 h-4 w-4 animate-spin" />
                      {tc("save")}
                    </>
                  ) : (
                    tc("save")
                  )}
                </Button>
              </SaveRow>
            ) : null}
          </Section>
        );
      })}
    </>
  );
}
