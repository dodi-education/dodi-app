import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import { isSharingAdded, unshareDiscoverGame } from "@dodi/client-state/game-sharing";
import type { DiscoverGameSummary } from "@dodi/types/games";
import { libraryEmpty, libraryLoadMore, libraryPill as p, libraryRow as r } from "@dodi/ui-recipes";

import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useGameStore } from "@/lib/client-state";
import { gameFlowDeps } from "@/lib/game-flow-deps";

import { DiscoverShareDialog } from "./discover-share-dialog";
import { type GameAction, GameActionsSheet } from "./game-actions-sheet";
import { GameExportDialog } from "./game-export-dialog";
import { GameStats, GameThumb, RowMenuButton } from "./library-row-parts";
import { DiscoverRemixDialog } from "./remix-dialogs";
import { useDialogTarget } from "./use-dialog-target";

/**
 * "Discover games" (web: discover-list): published games, plaintext by
 * design. Share is play-in-place (this family's sharing rows on the single
 * published row); Remix is the copy path.
 */
export function DiscoverList() {
  const t = useTranslations("gameStudio");
  const locale = useLocale();
  const router = useRouter();

  const games = useGameStore((s) => s.discover);
  const cursor = useGameStore((s) => s.discoverCursor);
  const loadDiscover = useGameStore((s) => s.loadDiscover);
  const loadMoreDiscover = useGameStore((s) => s.loadMoreDiscover);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [menuFor, setMenuFor] = useState<DiscoverGameSummary | null>(null);
  /** Game id currently clearing its share (disables its trash button). */
  const [removingId, setRemovingId] = useState<string | null>(null);
  const shareDialog = useDialogTarget<DiscoverGameSummary>();
  const remixDialog = useDialogTarget<DiscoverGameSummary>();
  const exportDialog = useDialogTarget<DiscoverGameSummary>();

  // loadDiscover no-ops when the cache already matches this locale, so
  // re-firing on `games` (after invalidate()) stays loop-free.
  useEffect(() => {
    loadDiscover(locale)
      .then(() => setError(null))
      .catch(() => setError(t("discoverFailedGeneric")));
  }, [games, locale, loadDiscover, t]);

  const openPreview = (id: string): void => router.push(`/parent/games/${id}` as Href);

  async function removeShare(game: DiscoverGameSummary): Promise<void> {
    if (removingId) return;
    setRemovingId(game.id);
    try {
      await unshareDiscoverGame(gameFlowDeps(), game.id);
    } catch {
      setError(t("discoverFailedGeneric"));
    } finally {
      setRemovingId(null);
    }
  }

  if (games === null) return <Text className={libraryEmpty}>{error ?? "…"}</Text>;
  if (games.length === 0) return <Text className={libraryEmpty}>{t("discoverEmpty")}</Text>;

  const actions = (g: DiscoverGameSummary): GameAction[] => [
    { key: "preview", icon: "show", label: t("preview"), onPress: () => openPreview(g.id) },
    { key: "remix", icon: "copy", label: t("discoverRemix"), onPress: () => remixDialog.show(g) },
    { key: "export", icon: "download", label: t("export"), onPress: () => exportDialog.show(g) },
  ];

  return (
    <View>
      {games.map((g, i) => {
        const isAdded = isSharingAdded(g.sharing);
        const byline = g.is_system
          ? `${t("discoverByDodi")} · `
          : g.publication_handle
            ? `${t("discoverBy", { handle: g.publication_handle })} · `
            : "";
        return (
          <View key={g.id} className={cn(r.box, i === games.length - 1 && !cursor && r.last)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={g.title}
              onPress={() => openPreview(g.id)}
              className={cn(r.button, "active:bg-card")}
            >
              <GameThumb previewImage={g.preview_image} tags={g.tags} />
              <View className={r.main}>
                <View className={r.titleRow}>
                  <Text className={cn(r.title, "shrink")} numberOfLines={1}>
                    {g.title}
                  </Text>
                  {isAdded ? (
                    <View className={cn(p.withIcon, p.box, p.primary)}>
                      <Icon name="check" size={11} stroke={3} color="primary" />
                      <Text className={cn(p.text, p.primaryText)}>{t("discoverAdded")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className={r.meta} numberOfLines={1}>
                  {byline}
                  {t("discoverAges", { min: g.target_age_min, max: g.target_age_max })}
                  {" · "}
                  {t("discoverDuration", { minutes: g.estimated_duration_minutes })}
                </Text>
                <GameStats plays={g.plays} copies={g.copies} tags={g.tags} />
              </View>
            </Pressable>
            {/* Share is the primary Discover action; once shared it becomes a
                red trash that clears this family's audience. */}
            {isAdded ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("discoverUnshare")}
                accessibilityState={{ disabled: removingId === g.id }}
                disabled={removingId === g.id}
                hitSlop={4}
                onPress={() => void removeShare(g)}
                className={cn(r.unshare, removingId === g.id && "opacity-50", "active:opacity-80")}
              >
                <Icon name="delete" size={18} color="primary-foreground" />
              </Pressable>
            ) : (
              <Button
                size="icon"
                accessibilityLabel={t("discoverShare")}
                hitSlop={4}
                onPress={() => shareDialog.show(g)}
              >
                <Icon name="user_share" size={18} color="primary-foreground" />
              </Button>
            )}
            <RowMenuButton label={t("gameActions", { title: g.title })} onPress={() => setMenuFor(g)} />
          </View>
        );
      })}

      {cursor ? (
        <View className={libraryLoadMore.box}>
          <Button
            variant="outline"
            size="sm"
            isLoading={isLoadingMore}
            onPress={() => {
              setIsLoadingMore(true);
              loadMoreDiscover()
                .catch(() => setError(t("discoverFailedGeneric")))
                .finally(() => setIsLoadingMore(false));
            }}
          >
            {t("discoverLoadMore")}
          </Button>
        </View>
      ) : null}

      <GameActionsSheet
        title={menuFor?.title ?? ""}
        actions={menuFor ? actions(menuFor) : []}
        isOpen={menuFor !== null}
        onClose={() => setMenuFor(null)}
      />
      <DiscoverShareDialog isOpen={shareDialog.isOpen} game={shareDialog.target} onClose={shareDialog.hide} />
      <DiscoverRemixDialog isOpen={remixDialog.isOpen} game={remixDialog.target} onClose={remixDialog.hide} />
      <GameExportDialog
        isOpen={exportDialog.isOpen}
        gameId={exportDialog.target?.id ?? null}
        onClose={exportDialog.hide}
        source="discover"
      />
    </View>
  );
}
