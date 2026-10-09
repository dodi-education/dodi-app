"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { characterModelFor } from "@dodi/character/character-catalog";
import { canPerformTrick } from "@dodi/client-state/custom-tricks";
import type { StageTrick } from "@dodi/client-state/companion-stage-store";
import { playground as p } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { useActiveCompanion } from "@/hooks/use-active-companion";
import { cn } from "@/lib/utils";
import { useCompanionStageStore } from "@/stores/companion-stage-store";
import { useCustomTricksStore } from "@/stores/custom-tricks-store";

function TrickRow({ trick, isDisabled, onDelete }: { trick: StageTrick; isDisabled: boolean; onDelete?: () => void }) {
  const t = useTranslations("playground");
  const requestTrick = useCompanionStageStore((s) => s.requestTrick);
  const playingTrickId = useCompanionStageStore((s) => s.playingTrickId);
  return (
    <div className={cn(p.trick, p.webTrick, isDisabled && p.trickDisabled)}>
      <button
        type="button"
        className={cn(p.chip, p.webChip, playingTrickId === trick.id && p.chipSelected)}
        disabled={isDisabled}
        aria-label={trick.name}
        title={isDisabled ? t("trickNeedsBones") : undefined}
        onClick={() => void requestTrick(trick)}
      >
        <Icon name="play" size={16} />
      </button>
      <span className={p.trickName}>{trick.name}</span>
      {onDelete ? (
        <button type="button" className={cn(p.chip, p.webChip)} aria-label={t("deleteTrick")} onClick={onDelete}>
          <Icon name="delete" size={16} />
        </button>
      ) : null}
    </div>
  );
}

/** Built-in tricks and the companion's own; tap to play. */
export function TricksPanel() {
  const t = useTranslations("playground");
  const { companion, look } = useActiveCompanion();
  const custom = useCustomTricksStore((s) => (companion ? s.byCompanion[companion.id] : undefined));
  const loadTricks = useCustomTricksStore((s) => s.load);
  const removeTrick = useCustomTricksStore((s) => s.remove);
  const model = characterModelFor(look.model);

  useEffect(() => {
    if (companion) void loadTricks(companion.id).catch(() => {});
  }, [companion, loadTricks]);

  return (
    <>
      <div className={cn(p.section, p.webSection)}>
        <span className={p.label}>{t("builtInTricks")}</span>
        {model.tricks.map((trick) => (
          <TrickRow
            key={trick.id}
            trick={{ id: trick.id, name: t(`tricks.${trick.labelKey}`), script: trick.script }}
            isDisabled={false}
          />
        ))}
      </div>
      <div className={cn(p.section, p.webSection)}>
        <span className={p.label}>{t("yourTricks")}</span>
        {custom && custom.length === 0 ? <p className={p.hint}>{t("noCustomTricks")}</p> : null}
        {(custom ?? []).map((trick) => (
          <TrickRow
            key={trick.id}
            trick={{ id: trick.id, name: trick.name, script: trick.script }}
            isDisabled={!canPerformTrick(trick, look.model)}
            onDelete={() => {
              if (companion && confirm(t("confirmDeleteTrick", { name: trick.name }))) {
                void removeTrick(companion.id, trick.id).catch(() => {});
              }
            }}
          />
        ))}
      </div>
    </>
  );
}
