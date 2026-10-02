import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { GAME_TAGS } from "@dodi/games/tags";
import { optionChip, tagPicker } from "@dodi/ui-recipes";

import { tagStyle } from "@/components/games-library/tag-style";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useTagLabel } from "@/lib/tag-label";

interface TagPickerProps {
  selected: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Compact tag field (web: TagPicker): only the selected tags plus an edit
 * button, which unfolds the full catalog for toggling.
 */
export function TagPicker({ selected, onChange }: TagPickerProps) {
  const t = useTranslations("gameStudio");
  const tagLabel = useTagLabel();
  const [isEditing, setIsEditing] = useState(false);
  const visibleTags = isEditing ? GAME_TAGS : GAME_TAGS.filter((tag) => selected.includes(tag.id));

  return (
    <View className={tagPicker.box}>
      {visibleTags.map((tag) => {
        const isSelected = selected.includes(tag.id);
        const chip = (
          <>
            <Icon name={tagStyle(tag.id).icon} size={15} color={isSelected ? "primary" : "ink-2"} />
            <Text className={cn(optionChip.text, isSelected ? optionChip.selectedText : optionChip.idleText)}>
              {tagLabel(tag.id)}
            </Text>
            {isEditing && isSelected ? <Icon name="check" size={13} stroke={3} color="primary" /> : null}
          </>
        );
        const chipClass = cn(optionChip.box, isSelected ? optionChip.selected : optionChip.idle);
        return isEditing ? (
          <Pressable
            key={tag.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            onPress={() =>
              onChange(isSelected ? selected.filter((x) => x !== tag.id) : [...selected, tag.id])
            }
            hitSlop={4}
            className={chipClass}
          >
            {chip}
          </Pressable>
        ) : (
          <View key={tag.id} className={chipClass}>
            {chip}
          </View>
        );
      })}
      {!isEditing && visibleTags.length === 0 ? <Text className={tagPicker.none}>{t("tagsNone")}</Text> : null}
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11"
        icon={isEditing ? "check" : "edit"}
        accessibilityState={{ expanded: isEditing }}
        onPress={() => setIsEditing((v) => !v)}
      >
        {isEditing ? t("tagsDone") : visibleTags.length === 0 ? t("tagsAdd") : t("tagsEdit")}
      </Button>
    </View>
  );
}
