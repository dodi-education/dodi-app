import { type Href, Link } from "expo-router";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";
import { type DecodedSnapshot, isNewSnapshot } from "@dodi/client-state/snapshots";
import { kidCard, kidCardIcons } from "@dodi/ui-recipes";

import { KidButton } from "@/components/kid/kid-button";
import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { Button, Dialog, Icon } from "@/components/ui";
import { useConnectivityStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";

/**
 * One saved moment in the kid's collection (web: components/snapshots/
 * snapshot-card): thumbnail, titles, date, "from a friend" / "new" badges,
 * delete (confirmed in a dialog where the web uses the browser's confirm) and
 * Open.
 */
export function SnapshotCard({
  snapshot,
  onDelete,
}: {
  snapshot: DecodedSnapshot;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("snapshots");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const { view, info, senderName } = snapshot;
  // Deleting is a server round-trip; offline it would fail and reload.
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const isReceived = view.origin === "received";
  const isNew = isNewSnapshot(view);
  const createdAt = new Date(info?.createdAt ?? view.createdAt);
  const href = `/snapshots/${view.id}` as Href;
  const title = info?.title ?? t("openFailed");

  return (
    <View className={kidCard.box} style={kidShadowStyle("row")}>
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={title} className={kidCard.link}>
          {info?.thumbnail ? (
            <Image
              source={{ uri: info.thumbnail }}
              className={cn(kidCard.thumb, kidCard.snapshotThumb)}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className={cn(kidCard.tile, kidCard.snapshotTile)}>
              <Icon name="camera" size={kidCardIcons.tile.size} stroke={kidCardIcons.tile.stroke} color="primary" />
            </View>
          )}
          <View className={kidCard.main}>
            <KidText className={kidCard.title}>{title}</KidText>
            {info?.gameTitle ? <KidText className={cn(kidCard.metaLine, kidCard.meta)}>{info.gameTitle}</KidText> : null}
            <KidText className={kidCard.description}>{format.dateTime(createdAt, { dateStyle: "medium" })}</KidText>
            {isReceived || isNew ? (
              <View className={kidCard.badges}>
                {isReceived ? (
                  <View className={cn(kidCard.badge, kidCard.badgeFriend)}>
                    <KidText className={cn(kidCard.badgeText, kidCard.badgeFriendText)}>
                      {senderName ? t("fromFriend", { name: senderName }) : t("fromFriendUnknown")}
                    </KidText>
                  </View>
                ) : null}
                {isNew ? (
                  <View className={cn(kidCard.badge, kidCard.badgeNew)}>
                    <KidText className={cn(kidCard.badgeText, kidCard.badgeNewText)}>{t("newBadge")}</KidText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      </Link>

      <View className={kidCard.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("deleteAction")}
          accessibilityState={{ disabled: !isOnline }}
          disabled={!isOnline}
          onPress={() => setIsConfirmOpen(true)}
          className={cn(kidCard.iconButton, "active:bg-danger-soft")}
        >
          <Icon name="delete" size={kidCardIcons.delete.size} stroke={kidCardIcons.delete.stroke} color="danger" />
        </Pressable>
        <Link href={href} asChild>
          <KidButton size="sm" icon="play" iconSize={kidCardIcons.play.size} className={kidCard.play}>
            {t("openAction")}
          </KidButton>
        </Link>
      </View>

      <Dialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title={t("deleteAction")}
        description={t("deleteConfirm")}
        footer={
          <>
            <Button
              variant="destructive"
              icon="delete"
              onPress={() => {
                setIsConfirmOpen(false);
                onDelete(view.id);
              }}
            >
              {tCommon("delete")}
            </Button>
            <Button variant="outline" onPress={() => setIsConfirmOpen(false)}>
              {tCommon("cancel")}
            </Button>
          </>
        }
      />
    </View>
  );
}
