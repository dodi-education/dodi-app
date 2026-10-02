import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { type GameListItem, editedAgo } from "@dodi/client-state/game-library";
import { libraryPill as p, libraryRow as r } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { DeleteGameDialog } from "./delete-game-dialog";
import { DiscoverShareDialog } from "./discover-share-dialog";
import { type GameAction, GameActionsSheet } from "./game-actions-sheet";
import { GameExportDialog } from "./game-export-dialog";
import { GameStats, GameThumb, RowMenuButton } from "./library-row-parts";
import { PublishDialog } from "./publish-dialog";
import { StudioCopyDialog } from "./remix-dialogs";
import { useDialogTarget } from "./use-dialog-target";

/**
 * The family's games (web: game-studio-list). A row opens the studio; its
 * "…" actions open in the bottom sheet, each aimed at one shared dialog.
 * The family / kid badges are `sm:` only on the web, so a phone shows none.
 */
export function GameStudioList({
  items,
  onDelete,
}: {
  items: GameListItem[];
  /** Deletes the game server-side; the list owns the confirmation around it. */
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslations("gameStudio");
  const router = useRouter();
  const [menuFor, setMenuFor] = useState<GameListItem | null>(null);
  const deleteDialog = useDialogTarget<GameListItem>();
  const shareDialog = useDialogTarget<GameListItem>();
  const copyDialog = useDialogTarget<GameListItem>();
  const exportDialog = useDialogTarget<GameListItem>();
  const publishDialog = useDialogTarget<GameListItem>();

  const openStudio = (id: string): void => router.push(`/parent/game-studio/${id}` as Href);

  const actions = (g: GameListItem): GameAction[] => [
    { key: "edit", icon: "edit", label: t("edit"), onPress: () => openStudio(g.id) },
    { key: "share", icon: "user_share", label: t("discoverShare"), onPress: () => shareDialog.show(g) },
    { key: "copy", icon: "copy", label: t("discoverRemix"), onPress: () => copyDialog.show(g) },
    { key: "export", icon: "download", label: t("export"), onPress: () => exportDialog.show(g) },
    { key: "publish", icon: "world_up", label: t("publish"), onPress: () => publishDialog.show(g) },
    {
      key: "delete",
      icon: "delete",
      label: t("delete"),
      isDestructive: true,
      hasSeparatorBefore: true,
      onPress: () => deleteDialog.show(g),
    },
  ];

  return (
    <View>
      {items.map((g, i) => {
        const e = editedAgo(g.updatedAt);
        return (
          <View key={g.id} className={cn(r.box, i === items.length - 1 && r.last)}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={g.title}
              onPress={() => openStudio(g.id)}
              className={cn(r.link, "active:opacity-70")}
            >
              <GameThumb previewImage={g.previewImage} tags={g.tags} />
              <View className={r.main}>
                <View className={r.titleRow}>
                  <Text className={cn(r.title, "shrink")} numberOfLines={1}>
                    {g.title}
                  </Text>
                  {g.isPlanning ? (
                    <View className={cn(p.box, p.primary)}>
                      <Text className={cn(p.text, p.primaryText)}>{t("planning")}</Text>
                    </View>
                  ) : g.isActive ? (
                    <View className={cn(p.withIcon, p.box, p.primary)}>
                      <View className={p.dot} />
                      <Text className={cn(p.text, p.primaryText)}>{t("active")}</Text>
                    </View>
                  ) : (
                    <View className={cn(p.box, p.muted)}>
                      <Text className={cn(p.text, p.mutedText)}>{t("inactive")}</Text>
                    </View>
                  )}
                </View>
                <Text className={r.meta} numberOfLines={1}>
                  {t(e.key, e.values)}
                </Text>
                <GameStats plays={g.plays} copies={g.copies} tags={g.tags} />
              </View>
            </Pressable>
            <RowMenuButton label={t("gameActions", { title: g.title })} onPress={() => setMenuFor(g)} />
          </View>
        );
      })}

      <GameActionsSheet
        title={menuFor?.title ?? ""}
        actions={menuFor ? actions(menuFor) : []}
        isOpen={menuFor !== null}
        onClose={() => setMenuFor(null)}
      />
      <DiscoverShareDialog
        isOpen={shareDialog.isOpen}
        game={
          shareDialog.target
            ? { id: shareDialog.target.id, title: shareDialog.target.title, sharing: shareDialog.target.sharing }
            : null
        }
        onClose={shareDialog.hide}
        variant="studio"
      />
      <StudioCopyDialog isOpen={copyDialog.isOpen} game={copyDialog.target} onClose={copyDialog.hide} />
      <GameExportDialog
        isOpen={exportDialog.isOpen}
        gameId={exportDialog.target?.id ?? null}
        onClose={exportDialog.hide}
      />
      <PublishDialog
        isOpen={publishDialog.isOpen}
        gameId={publishDialog.target?.id ?? null}
        isBuilt={publishDialog.target?.built ?? false}
        onClose={publishDialog.hide}
      />
      <DeleteGameDialog
        isOpen={deleteDialog.isOpen}
        game={deleteDialog.target}
        onClose={deleteDialog.hide}
        onDelete={onDelete}
      />
    </View>
  );
}
