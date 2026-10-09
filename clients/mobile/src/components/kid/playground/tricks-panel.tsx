import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { characterModelFor } from "@dodi/character/character-catalog";
import type { StageTrick } from "@dodi/client-state/companion-stage-store";
import { canPerformTrick, type CustomTrickView } from "@dodi/client-state/custom-tricks";
import { playground as p } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { Button, Dialog, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useCompanionStageStore, useCustomTricksStore } from "@/lib/client-state";
import { useActiveCompanion } from "@/lib/use-active-companion";

import { PlaygroundChip } from "./chip";

function TrickRow({ trick, isDisabled, onDelete }: { trick: StageTrick; isDisabled: boolean; onDelete?: () => void }) {
  const t = useTranslations("playground");
  const requestTrick = useCompanionStageStore((s) => s.requestTrick);
  const playingTrickId = useCompanionStageStore((s) => s.playingTrickId);
  return (
    <View className={cn(p.trick, isDisabled && p.trickDisabled)}>
      <PlaygroundChip
        isSelected={playingTrickId === trick.id}
        disabled={isDisabled}
        accessibilityLabel={trick.name}
        accessibilityHint={isDisabled ? t("trickNeedsBones") : undefined}
        onPress={() => void requestTrick(trick)}
      >
        <Icon name="play" size={16} color="ink" />
      </PlaygroundChip>
      <KidText className={p.trickName}>{trick.name}</KidText>
      {onDelete ? (
        <PlaygroundChip accessibilityLabel={t("deleteTrick")} onPress={onDelete}>
          <Icon name="delete" size={16} color="ink" />
        </PlaygroundChip>
      ) : null}
    </View>
  );
}

/** Built-in tricks and the companion's own; tap to play (web: kid/playground/tricks-panel). */
export function TricksPanel() {
  const t = useTranslations("playground");
  const tc = useTranslations("common");
  const { companion, look } = useActiveCompanion();
  const custom = useCustomTricksStore((s) => (companion ? s.byCompanion[companion.id] : undefined));
  const loadTricks = useCustomTricksStore((s) => s.load);
  const removeTrick = useCustomTricksStore((s) => s.remove);
  const [deleting, setDeleting] = useState<CustomTrickView | null>(null);
  const model = characterModelFor(look.model);

  useEffect(() => {
    if (companion) void loadTricks(companion.id).catch(() => {});
  }, [companion, loadTricks]);

  return (
    <>
      <View className={p.section}>
        <KidText className={p.label}>{t("builtInTricks")}</KidText>
        {model.tricks.map((trick) => (
          <TrickRow
            key={trick.id}
            trick={{ id: trick.id, name: t(`tricks.${trick.labelKey}`), script: trick.script }}
            isDisabled={false}
          />
        ))}
      </View>
      <View className={p.section}>
        <KidText className={p.label}>{t("yourTricks")}</KidText>
        {custom && custom.length === 0 ? <KidText className={p.hint}>{t("noCustomTricks")}</KidText> : null}
        {(custom ?? []).map((trick) => (
          <TrickRow
            key={trick.id}
            trick={{ id: trick.id, name: trick.name, script: trick.script }}
            isDisabled={!canPerformTrick(trick, look.model)}
            onDelete={() => setDeleting(trick)}
          />
        ))}
      </View>

      {/* The web's confirm() as the kit's Dialog. */}
      <Dialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("deleteTrick")}
        description={deleting ? t("confirmDeleteTrick", { name: deleting.name }) : undefined}
        footer={
          <>
            <Button
              variant="destructive"
              icon="delete"
              onPress={() => {
                if (companion && deleting) void removeTrick(companion.id, deleting.id).catch(() => {});
                setDeleting(null);
              }}
            >
              {t("deleteTrick")}
            </Button>
            <Button variant="outline" onPress={() => setDeleting(null)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </>
  );
}
