import { useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import {
  MAX_CUSTOM_TRICKS_PER_COMPANION,
  TRICK_DESCRIPTION_MAX_LENGTH,
  teachTrick,
  trickLanguageName,
  type TeachTrickResult,
} from "@dodi/client-state/custom-tricks";
import { input as inputRecipe, playground as p } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useCompanionStageStore, useCustomTricksStore } from "@/lib/client-state";
import { teachTrickDeps } from "@/lib/companion-flow-deps";
import { useDodiSessionStore } from "@/lib/dodi-session-store";
import { fontFamilyFor } from "@/lib/fonts";
import { useActiveCompanion } from "@/lib/use-active-companion";

import { PlaygroundChip } from "./chip";

const SUGGESTIONS = ["spin", "jump", "bow", "dance", "flap"] as const;
const INPUT_CLASSES = cn(p.input, "font-kid");

type Learned = Extract<TeachTrickResult, { ok: true }>;

/**
 * "Teach a trick" (web: kid/playground/teach-trick-panel): the kid says what
 * to learn, the companion tries it, the kid keeps it.
 */
export function TeachTrickPanel() {
  const t = useTranslations("playground");
  const { kid, companion, look } = useActiveCompanion();
  const requestTrick = useCompanionStageStore((s) => s.requestTrick);
  const saveTrick = useCustomTricksStore((s) => s.save);
  const knownCount = useCustomTricksStore((s) => (companion ? (s.byCompanion[companion.id]?.length ?? 0) : 0));
  const beginAiActivity = useDodiSessionStore((s) => s.beginAiActivity);
  const endAiActivity = useDodiSessionStore((s) => s.endAiActivity);
  const [description, setDescription] = useState("");
  const [isTeaching, setIsTeaching] = useState(false);
  const [learned, setLearned] = useState<Learned | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isFull = knownCount >= MAX_CUSTOM_TRICKS_PER_COMPANION;

  async function teach(text: string): Promise<void> {
    if (!kid || !text.trim() || isTeaching) return;
    setIsTeaching(true);
    setMessage(null);
    setLearned(null);
    // The companion shows its thinking pose while the trick is written.
    beginAiActivity("thinking");
    let result: TeachTrickResult;
    try {
      result = await useCompanionStageStore.getState().whileLearning(() =>
        teachTrick(teachTrickDeps(), {
          kidId: kid.id,
          model: look.model,
          description: text,
          languageName: trickLanguageName(kid.language),
        }),
      );
    } finally {
      endAiActivity("thinking");
      setIsTeaching(false);
    }
    if (!result.ok) {
      setMessage(result.reason === "no_thinking" ? t("teachNoThinking") : t("teachFailed"));
      return;
    }
    setLearned(result);
    void requestTrick({ id: "preview", name: result.record.name, script: result.script });
  }

  async function keep(): Promise<void> {
    if (!learned || !companion) return;
    try {
      await saveTrick(companion.id, learned.record);
      setLearned(null);
      setDescription("");
      setMessage(t("saved"));
    } catch {
      setMessage(t("saveFailed"));
    }
  }

  if (isFull) return <KidText className={p.hint}>{t("teachLimit")}</KidText>;

  return (
    <>
      <View className={p.section}>
        <KidText className={p.label}>{t("teachPrompt")}</KidText>
        <TextInput
          value={description}
          placeholder={t("teachPlaceholder")}
          placeholderTextColor={inputRecipe.placeholderColor}
          maxLength={TRICK_DESCRIPTION_MAX_LENGTH}
          onChangeText={setDescription}
          editable={!isTeaching}
          returnKeyType="go"
          onSubmitEditing={() => void teach(description)}
          accessibilityLabel={t("teachPrompt")}
          className={INPUT_CLASSES}
          style={{ fontFamily: fontFamilyFor(INPUT_CLASSES) }}
        />
        <View className={p.row}>
          {SUGGESTIONS.map((key) => (
            <PlaygroundChip
              key={key}
              disabled={isTeaching}
              onPress={() => {
                const text = t(`suggestions.${key}`);
                setDescription(text);
                void teach(text);
              }}
            >
              {t(`suggestions.${key}`)}
            </PlaygroundChip>
          ))}
        </View>
        <PlaygroundChip
          isSelected
          disabled={isTeaching || !description.trim()}
          accessibilityLabel={isTeaching ? t("teaching") : t("teachButton")}
          onPress={() => void teach(description)}
        >
          {isTeaching ? (
            <ActivityIndicator size="small" color={COLORS["dodi-500"]} />
          ) : (
            <Icon name="wand" size={16} color="ink" />
          )}
          <KidText className={p.chipText}>{isTeaching ? t("teaching") : t("teachButton")}</KidText>
        </PlaygroundChip>
      </View>

      {learned ? (
        <View className={p.trick}>
          <KidText className={p.trickName}>{learned.record.name}</KidText>
          <PlaygroundChip onPress={() => void teach(description)}>{t("tryAgain")}</PlaygroundChip>
          <PlaygroundChip isSelected onPress={() => void keep()}>
            {t("keepIt")}
          </PlaygroundChip>
        </View>
      ) : null}
      {message ? (
        <KidText className={p.hint} accessibilityLiveRegion="polite">
          {message}
        </KidText>
      ) : null}
    </>
  );
}
