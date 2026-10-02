import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import { isSharingAdded } from "@dodi/client-state/game-sharing";
import type { DiscoverGameDetail, GameSharingState } from "@dodi/types/games";
import { gamePreview as g } from "@dodi/ui-recipes";

import { GameStage } from "@/components/games/game-stage";
import { CodeViewer } from "@/components/studio/code-viewer";
import { Button } from "@/components/ui";
import { useBreadcrumbStore } from "@/lib/breadcrumb-store";

import { DiscoverShareDialog } from "./discover-share-dialog";
import { PreviewInfos } from "./preview-infos";
import { SegTab } from "./seg-tab";

type PreviewView = "infos" | "code" | "preview";

/**
 * Read-only parent preview of a PUBLISHED game (web: game-preview): the
 * studio's Preview / Code / Infos stage without the agent chat or editing.
 * Everything shown is plaintext (a voluntary disclosure), so no vault step.
 * "Share with kids" sits where the studio has its active switch. The web's
 * "Added" chip is `sm:` only, so a phone shows none.
 */
export function GamePreview({
  detail,
  sharing: initialSharing,
}: {
  detail: DiscoverGameDetail;
  /** THIS family's current audience for the game: seeds the share dialog. */
  sharing: GameSharingState;
}) {
  const t = useTranslations("gameStudio");
  const locale = useLocale();
  const [view, setView] = useState<PreviewView>("preview");
  const [isShareOpen, setIsShareOpen] = useState(false);
  // Kept locally so a save re-seeds the pills on the next open.
  const [sharing, setSharing] = useState<GameSharingState>(initialSharing);

  // The game title is the breadcrumb leaf (the route only has the id).
  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    setLeaf(detail.title.trim() || null);
    return () => setLeaf(null);
  }, [detail.title, setLeaf]);

  return (
    <View className="flex-1 bg-background">
      <View className={g.header}>
        <View className={g.segments} accessibilityRole="tablist">
          <SegTab isActive={view === "infos"} onPress={() => setView("infos")} icon="info" label={t("infos")} />
          <SegTab isActive={view === "code"} onPress={() => setView("code")} icon="code" label={t("code")} />
          <SegTab
            isActive={view === "preview"}
            onPress={() => setView("preview")}
            icon="show"
            label={t("preview")}
          />
        </View>
        <View className={g.headerActions}>
          <Button
            size="sm"
            icon="user_share"
            accessibilityHint={isSharingAdded(sharing) ? t("discoverAdded") : undefined}
            onPress={() => setIsShareOpen(true)}
          >
            {t("discoverShare")}
          </Button>
        </View>
      </View>

      {/* The sandbox stays mounted across tabs so returning to Preview doesn't reload the game. */}
      {detail.code_bundle ? (
        <ScrollView
          className={view === "preview" ? "flex-1" : "hidden"}
          contentContainerClassName={g.stage}
          accessibilityElementsHidden={view !== "preview"}
          importantForAccessibility={view === "preview" ? "auto" : "no-hide-descendants"}
        >
          <GameStage gameId={detail.id} codeBundle={detail.code_bundle} locale={locale} />
        </ScrollView>
      ) : null}

      {view === "code" ? (
        <CodeViewer code={detail.code_bundle} copyLabel={t("copy")} copiedLabel={t("copied")} />
      ) : null}

      {view === "infos" ? (
        <ScrollView className="flex-1">
          <PreviewInfos detail={detail} />
        </ScrollView>
      ) : null}

      <DiscoverShareDialog
        isOpen={isShareOpen}
        game={{ id: detail.id, title: detail.title, sharing }}
        onClose={() => setIsShareOpen(false)}
        onSaved={setSharing}
      />
    </View>
  );
}
