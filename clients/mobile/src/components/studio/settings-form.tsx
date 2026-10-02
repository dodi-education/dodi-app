import { View } from "react-native";
import { useTranslations } from "use-intl";
import type { InvalidSettings } from "@dodi/studio/settings-save";
import type { StudioKid } from "@dodi/studio/build-runner";
import type { StudioGame } from "@dodi/studio/studio-game";
import { studioSettings, studioTextarea } from "@dodi/ui-recipes";

import { AgeRange } from "@/components/games-library/age-range";
import { AudiencePill } from "@/components/games-library/audience-pill";
import { Button, Input, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { ListingTranslationsField } from "./listing-translations-field";
import { Field, OpenSettingsLink, PerspectivePicker, SwitchField } from "./settings-fields";
import { StudioTextarea } from "./studio-textarea";
import { TagPicker } from "./tag-picker";
import type { ListingTranslations } from "./use-listing-translations";

export interface SettingsFormProps {
  game: StudioGame;
  kids: StudioKid[];
  invalid: InvalidSettings;
  setField: <K extends keyof StudioGame>(key: K, value: StudioGame[K]) => void;
  selectFamily: () => void;
  toggleKid: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  justSaved: boolean;
  error: string | null;
  /** Image model configured + key available (null = still loading). */
  hasImageProvider: boolean | null;
  /** Still in the Plan step: this save is the first, mandatory one. */
  isPlanning: boolean;
  /** A plan was agreed in the Plan step: saving starts the build right away. */
  hasAcceptedPlan: boolean;
  listingTranslations: ListingTranslations;
  /** The game's own (the child's) language, marked on its listing card (null = unknown). */
  listingSourceLocale: string | null;
}

/** The game's settings (web: game-studio SettingsForm). */
export function SettingsForm({
  game,
  kids,
  invalid,
  setField,
  selectFamily,
  toggleKid,
  onSave,
  saving,
  justSaved,
  error,
  hasImageProvider,
  isPlanning,
  hasAcceptedPlan,
  listingTranslations,
  listingSourceLocale,
}: SettingsFormProps) {
  const t = useTranslations("gameStudio");
  const noteLink = cn(studioSettings.note, studioSettings.link);

  return (
    <View className={cn(studioSettings.form, "w-full")}>
      <Field label={t("gameName")} required>
        <Input
          value={game.title}
          placeholder={t("gameNamePlaceholder")}
          isInvalid={invalid.title}
          accessibilityLabel={t("gameName")}
          onChangeText={(v) => setField("title", v)}
        />
      </Field>

      <Field label={t("forKid")} required>
        <View className={cn(studioSettings.chips, invalid.audience && studioSettings.chipsInvalid)}>
          <AudiencePill isSelected={game.isFamily} onPress={selectFamily} hasIcon label={t("family")} />
          {kids.map((k) => (
            <AudiencePill
              key={k.id}
              isSelected={!game.isFamily && game.audienceIds.includes(k.id)}
              onPress={() => toggleKid(k.id)}
              initial={k.name.charAt(0).toUpperCase()}
              label={k.name}
            />
          ))}
        </View>
      </Field>

      <Field label={t("learningGoal")} required>
        <StudioTextarea
          className={studioTextarea.goal}
          value={game.learningGoal}
          placeholder={t("learningGoalPlaceholder")}
          isInvalid={invalid.learningGoal}
          accessibilityLabel={t("learningGoal")}
          onChangeText={(v) => setField("learningGoal", v)}
        />
      </Field>

      <Field
        label={t("successDefinition")}
        hint={game.successDefinition ? t("progressKindGoal") : t("progressKindOpen")}
      >
        <StudioTextarea
          className={studioTextarea.success}
          value={game.successDefinition}
          placeholder={t("successPlaceholder")}
          accessibilityLabel={t("successDefinition")}
          onChangeText={(v) => setField("successDefinition", v)}
        />
      </Field>

      <Field label={t("tags")} hint={t("tagsHint")}>
        <TagPicker selected={game.tags} onChange={(tags) => setField("tags", tags)} />
      </Field>

      <Field label={t("recommendedAge")} hint={invalid.age ? undefined : t("recommendedAgeHint")}>
        <AgeRange
          min={game.targetAgeMin}
          max={game.targetAgeMax}
          onMinChange={(v) => setField("targetAgeMin", v)}
          onMaxChange={(v) => setField("targetAgeMax", v)}
          minLabel={t("ageMinLabel")}
          maxLabel={t("ageMaxLabel")}
        />
        {invalid.age ? <Text className={studioSettings.error}>{t("ageRangeInvalid")}</Text> : null}
      </Field>

      <Field label={t("perspectiveLabel")} hint={t("perspectiveHint")}>
        <PerspectivePicker value={game.perspective} onChange={(v) => setField("perspective", v)} />
      </Field>

      <Field
        label={t("backgroundImageLabel")}
        hint={hasImageProvider === false ? undefined : t("backgroundImageHint")}
      >
        <View className={studioSettings.stack}>
          <SwitchField
            label={t("backgroundImageToggle")}
            checked={game.generateBackgroundImage}
            disabled={!hasImageProvider}
            onCheckedChange={(checked) => setField("generateBackgroundImage", checked)}
          />
          {hasImageProvider === false ? (
            <Text className={studioSettings.note}>
              {`${t("backgroundImageNeedsProvider")} `}
              <OpenSettingsLink className={noteLink} />
            </Text>
          ) : null}
        </View>
      </Field>

      <Field
        label={t("previewImageLabel")}
        hint={hasImageProvider === false ? undefined : t("previewImageHint")}
      >
        <SwitchField
          label={t("previewImageToggle")}
          checked={game.generatePreviewImage}
          disabled={!hasImageProvider}
          onCheckedChange={(checked) => setField("generatePreviewImage", checked)}
        />
      </Field>

      <ListingTranslationsField
        entries={listingTranslations.entries}
        sourceLocale={listingSourceLocale}
        onChange={listingTranslations.setEntry}
      />

      {/* The form owns the save: a planning draft shows "Save & start
          building", an existing game "Save changes". A planning draft's save
          failures show here since its composer is hidden. */}
      <View className={studioSettings.save}>
        {isPlanning && error ? (
          <View accessibilityRole="alert" className={studioSettings.saveError}>
            <Text className={studioSettings.saveErrorText}>{error}</Text>
          </View>
        ) : null}
        {isPlanning && hasAcceptedPlan ? <Text className={studioSettings.note}>{t("planBuildHint")}</Text> : null}
        <Button
          size="lg"
          className="w-full"
          icon={justSaved ? "check" : isPlanning ? "sparkles" : undefined}
          onPress={onSave}
          disabled={saving || (isPlanning && !game.title.trim())}
        >
          {justSaved ? t("saved") : !isPlanning ? t("saveChanges") : t("saveAndBuild")}
        </Button>
      </View>
    </View>
  );
}
