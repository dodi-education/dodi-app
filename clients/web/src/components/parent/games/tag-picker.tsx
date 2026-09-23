"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { tagStyle } from "@/components/parent/games/tag-style";
import { useTagLabel } from "@/lib/games/tag-label";
import { cn } from "@/lib/utils";
import { GAME_TAGS } from "@dodi/games/tags";

interface TagPickerProps {
  selected: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Compact tag field: shows only the selected tags plus an edit button, which
 * unfolds the full catalog for toggling. Only the game-studio catalog is
 * offered; non-catalog tags are stripped on save.
 */
export function TagPicker({ selected, onChange }: TagPickerProps) {
  const t = useTranslations("gameStudio");
  const tagLabel = useTagLabel();
  const [isEditing, setIsEditing] = useState(false);

  const visibleTags = isEditing
    ? GAME_TAGS
    : GAME_TAGS.filter((tag) => selected.includes(tag.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleTags.map((tag) => {
        const isSelected = selected.includes(tag.id);
        const chip = (
          <>
            <Icon name={tagStyle(tag.id).icon} size={15} />
            {tagLabel(tag.id)}
            {isEditing && isSelected && <Icon name="check" size={13} strokeWidth={3} />}
          </>
        );
        const chipClass = cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
          isSelected
            ? "border-primary bg-primary-soft text-primary"
            : "border-border-strong bg-card text-ink-2 hover:border-faint",
        );
        return isEditing ? (
          <button
            key={tag.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() =>
              onChange(
                isSelected ? selected.filter((x) => x !== tag.id) : [...selected, tag.id],
              )
            }
            className={chipClass}
          >
            {chip}
          </button>
        ) : (
          <span key={tag.id} className={chipClass}>
            {chip}
          </span>
        );
      })}
      {!isEditing && visibleTags.length === 0 && (
        <span className="text-sm text-muted-foreground">{t("tagsNone")}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11"
        aria-expanded={isEditing}
        onClick={() => setIsEditing((v) => !v)}
      >
        <Icon name={isEditing ? "check" : "edit"} size={15} />
        {isEditing ? t("tagsDone") : visibleTags.length === 0 ? t("tagsAdd") : t("tagsEdit")}
      </Button>
    </div>
  );
}
