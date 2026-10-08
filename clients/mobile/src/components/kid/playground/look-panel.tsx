import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  ACCESSORIES,
  ACCESSORY_LIST,
  CHARACTER_MODELS,
  COLOR_SWATCHES,
  type AccessoryName,
  type CharacterModelId,
} from "@dodi/character/character-catalog";
import { defaultLook } from "@dodi/character/character-look";
import { COMPANION_NAME_MAX_LENGTH, renameCompanion } from "@dodi/client-state/companions";
import { input as inputRecipe, playground as p } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { cn } from "@/lib/cn";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { fontFamilyFor } from "@/lib/fonts";
import { useActiveCompanion } from "@/lib/use-active-companion";

import { PlaygroundChip } from "./chip";
import { useLookEditor } from "./use-look-editor";

const KID_ACCESSORIES = ACCESSORY_LIST.filter((name) => ACCESSORIES[name].isKidSelectable);
const MODELS = Object.values(CHARACTER_MODELS);
const INPUT_CLASSES = cn(p.input, "font-kid");

/** The companion's name, saved when the field is left. Remounts per companion. */
function NameField({
  kidId,
  companionId,
  saved,
  placeholder,
}: {
  kidId: string;
  companionId: string;
  saved: string;
  placeholder: string;
}) {
  const t = useTranslations("playground");
  const [draft, setDraft] = useState(saved);
  function save(): void {
    if (draft.trim() === saved) return;
    void renameCompanion(companionFlowDeps(), kidId, companionId, draft).catch(() => setDraft(saved));
  }
  return (
    <View className={p.section}>
      <KidText className={p.label}>{t("name")}</KidText>
      <TextInput
        value={draft}
        placeholder={placeholder}
        placeholderTextColor={inputRecipe.placeholderColor}
        maxLength={COMPANION_NAME_MAX_LENGTH}
        onChangeText={setDraft}
        onBlur={save}
        onSubmitEditing={save}
        returnKeyType="done"
        accessibilityLabel={t("name")}
        className={INPUT_CLASSES}
        style={{ fontFamily: fontFamilyFor(INPUT_CLASSES) }}
      />
    </View>
  );
}

/** Colors per part, accessories, the avatar (when allowed) and the name (web: kid/playground/look-panel). */
export function LookPanel() {
  const t = useTranslations("playground");
  const { kid, companion, name } = useActiveCompanion();
  const { look, change, status } = useLookEditor();
  const model = CHARACTER_MODELS[look.model];

  function setColor(material: string, base: string): void {
    change({ ...look, colors: { ...look.colors, [material]: base } });
  }

  function toggleAccessory(accessory: AccessoryName): void {
    const isWorn = look.accessories.includes(accessory);
    // One accessory per socket: a new hat replaces the old one.
    const socket = ACCESSORIES[accessory].socket;
    const others = look.accessories.filter((a) => a !== accessory && ACCESSORIES[a].socket !== socket);
    change({ ...look, accessories: isWorn ? others : [...others, accessory] });
  }

  function setModel(id: CharacterModelId): void {
    if (id !== look.model) change({ ...defaultLook(id), accessories: look.accessories });
  }

  return (
    <>
      {kid && companion ? (
        <NameField
          key={`${companion.id}:${companion.name ?? ""}`}
          kidId={kid.id}
          companionId={companion.id}
          saved={companion.name ?? ""}
          placeholder={name}
        />
      ) : null}

      {model.customizable.map((part) => {
        const partLabel = t(`parts.${part.labelKey}`);
        return (
          <View
            key={part.material}
            className={p.section}
            accessibilityRole="radiogroup"
            accessibilityLabel={t("colorFor", { part: partLabel })}
          >
            <KidText className={p.label}>{partLabel}</KidText>
            <View className={p.row}>
              {COLOR_SWATCHES.map((swatch) => {
                const isSelected = look.colors[part.material] === swatch.base;
                return (
                  <Pressable
                    key={swatch.base}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={swatch.base}
                    className={cn(p.swatch, isSelected && p.swatchSelected, "active:scale-95")}
                    // The catalog's swatch color (data from @dodi/character, not a theme color).
                    style={{ backgroundColor: swatch.base }}
                    onPress={() => setColor(part.material, swatch.base)}
                  />
                );
              })}
            </View>
          </View>
        );
      })}

      <View className={p.section}>
        <KidText className={p.label}>{t("accessories")}</KidText>
        <View className={p.row}>
          {KID_ACCESSORIES.map((accessory) => (
            <PlaygroundChip
              key={accessory}
              accessibilityRole="togglebutton"
              isSelected={look.accessories.includes(accessory)}
              onPress={() => toggleAccessory(accessory)}
            >
              {t(`accessoryNames.${ACCESSORIES[accessory].labelKey}`)}
            </PlaygroundChip>
          ))}
        </View>
      </View>

      {kid?.can_change_companion_avatar && MODELS.length > 1 ? (
        <View className={p.section}>
          <KidText className={p.label}>{t("avatar")}</KidText>
          <View className={p.row}>
            {MODELS.map((m) => (
              <PlaygroundChip
                key={m.id}
                accessibilityRole="togglebutton"
                isSelected={look.model === m.id}
                onPress={() => setModel(m.id)}
              >
                {t(`avatars.${m.labelKey}`)}
              </PlaygroundChip>
            ))}
          </View>
        </View>
      ) : null}

      <View className={cn(p.row, "justify-between")}>
        <PlaygroundChip onPress={() => change(defaultLook(look.model))}>{t("reset")}</PlaygroundChip>
        <KidText className={p.status} accessibilityLiveRegion="polite">
          {status === "saved" ? t("saved") : status === "failed" ? t("saveFailed") : ""}
        </KidText>
      </View>
    </>
  );
}
