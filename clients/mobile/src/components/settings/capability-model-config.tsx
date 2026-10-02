/**
 * The per-capability provider / model pickers (web: parent/capability-model-config):
 * Voice, Thinking, Game generation, Image. Each lists dodi AI (when active)
 * and the own providers that support the capability; under dodi AI a
 * category shows its service name instead of a model picker.
 */
import { useTranslations } from "use-intl";
import {
  CATEGORY_FIELDS,
  defaultModelFor,
  type DraftModelConfig,
  isDraftSavable,
  modelOptionsFor,
  type ProviderOption,
  providerOptionsFor,
  voiceOptionsFor,
  voiceProviderPatch,
} from "@dodi/client-state/model-config";
import type { AIProviderId } from "@dodi/types/ai";

import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Button, Select, type SelectOption, Text } from "@/components/ui";

const PROVIDER_NONE = "__none__";

export interface CapabilityModelConfigProps {
  config: DraftModelConfig;
  onChange: (patch: Partial<DraftModelConfig>) => void;
  /** The own providers in the vault. */
  byokProviders: ProviderOption[];
  /** dodi AI is active: offer it in every picker. */
  isDodiSelectable: boolean;
  onSave: () => void;
  isSaving: boolean;
  isSaved: boolean;
}

function toOptions<T extends string>(options: readonly { id: T; name: string }[]): SelectOption<T>[] {
  return options.map((o) => ({ value: o.id, label: o.name }));
}

/** The dodi AI service name in place of a model picker. */
function ServiceName({ children }: { children: string }) {
  return <Text className="text-sm text-muted-foreground">{children}</Text>;
}

export function CapabilityModelConfig({
  config,
  onChange,
  byokProviders,
  isDodiSelectable,
  onSave,
  isSaving,
  isSaved,
}: CapabilityModelConfigProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const dodiLabel = isDodiSelectable ? t("managedProviderOption") : null;

  const copy = {
    thinking: {
      title: t("thinkingModel"),
      desc: t("thinkingModelDescription"),
      providerLabel: t("thinkingProvider"),
      modelLabel: t("thinkingModel"),
      fallback: t("thinkingProviderFallback"),
      service: t("serviceThinking"),
    },
    game: {
      title: t("gameConfig"),
      desc: t("gameConfigDescription"),
      providerLabel: t("gameProvider"),
      modelLabel: t("gameModel"),
      fallback: t("gameProviderFallback"),
      service: t("serviceCode"),
    },
    image: {
      title: t("imageConfig"),
      desc: t("imageConfigDescription"),
      providerLabel: t("imageProvider"),
      modelLabel: t("imageModel"),
      fallback: t("imageProviderFallback"),
      service: t("serviceImage"),
    },
  };

  const voices = voiceOptionsFor(config.voiceProvider);
  const isVoiceOnDodi = config.voiceProvider === "dodi";
  return (
    <>
      <Section title={t("voiceConfig")} desc={t("voiceConfigDescription")}>
        <FieldRow label={t("voiceProvider")}>
          <Select<AIProviderId | "">
            label={t("voiceProvider")}
            value={config.voiceProvider}
            options={toOptions(providerOptionsFor("voice", byokProviders, dodiLabel))}
            onValueChange={(id) => id && onChange(voiceProviderPatch(id))}
          />
        </FieldRow>
        {voices && isVoiceOnDodi ? (
          <FieldRow label={t("voiceModel")}>
            <ServiceName>{t("serviceVoice")}</ServiceName>
          </FieldRow>
        ) : null}
        {voices && !isVoiceOnDodi ? (
          <FieldRow label={t("voiceModel")}>
            <Select
              label={t("voiceModel")}
              value={config.voiceModel}
              options={toOptions(modelOptionsFor(config.voiceProvider, "voice"))}
              onValueChange={(voiceModel) => onChange({ voiceModel })}
            />
          </FieldRow>
        ) : null}
        {voices ? (
          <FieldRow label={t("voiceName")}>
            <Select
              label={t("voiceName")}
              value={config.voiceName}
              options={toOptions(voices)}
              onValueChange={(voiceName) => onChange({ voiceName })}
            />
          </FieldRow>
        ) : null}
      </Section>

      {CATEGORY_FIELDS.map((cat, index) => {
        const text = copy[cat.key];
        const provider = config[cat.provider];
        const set = (nextProvider: AIProviderId | "", model: string) =>
          onChange({ [cat.provider]: nextProvider, [cat.model]: model });
        const isLast = index === CATEGORY_FIELDS.length - 1;
        return (
          <Section key={cat.key} title={text.title} desc={text.desc}>
            <FieldRow label={text.providerLabel}>
              <Select<string>
                label={text.providerLabel}
                value={provider || PROVIDER_NONE}
                options={[
                  { value: PROVIDER_NONE, label: text.fallback },
                  ...toOptions(providerOptionsFor(cat.capability, byokProviders, dodiLabel)),
                ]}
                onValueChange={(value) => {
                  if (value === PROVIDER_NONE) return set("", "");
                  const id = value as AIProviderId;
                  set(id, defaultModelFor(id, cat.capability));
                }}
              />
            </FieldRow>
            {provider === "dodi" ? (
              <FieldRow label={text.modelLabel}>
                <ServiceName>{text.service}</ServiceName>
              </FieldRow>
            ) : null}
            {provider && provider !== "dodi" ? (
              <FieldRow label={text.modelLabel}>
                <Select
                  label={text.modelLabel}
                  value={config[cat.model]}
                  options={toOptions(modelOptionsFor(provider, cat.capability))}
                  onValueChange={(model) => set(provider, model)}
                />
              </FieldRow>
            ) : null}
            {isLast ? (
              <SaveRow note={isSaved ? t("configSaved") : undefined}>
                <Button isLoading={isSaving} disabled={!isDraftSavable(config)} onPress={onSave}>
                  {tc("save")}
                </Button>
              </SaveRow>
            ) : null}
          </Section>
        );
      })}
    </>
  );
}
