"use client";

import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { OfflineAwareLink } from "@/components/shared/offline-aware-link";
import { KidButton } from "@/components/kid/kid-button";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import type { DecodedSnapshot } from "@/hooks/use-snapshots";
import { isNewSnapshot } from "@dodi/client-state/snapshots";
import { kidCard } from "@dodi/ui-recipes";

interface SnapshotCardProps {
  snapshot: DecodedSnapshot;
  onDelete: (id: string) => void;
}

export function SnapshotCard({ snapshot, onDelete }: SnapshotCardProps) {
  const t = useTranslations("snapshots");
  const format = useFormatter();
  const { view, info, senderName } = snapshot;
  // Deleting is a server round-trip; offline it would fail and reload.
  const isOnline = useOnline();

  const isReceived = view.origin === "received";
  const isNew = isNewSnapshot(view);
  const createdAt = new Date(info?.createdAt ?? view.createdAt);

  return (
    <div className={cn(kidCard.web, kidCard.box)}>
      <OfflineAwareLink
        href={`/snapshots/${view.id}`}
        className={cn(kidCard.webLink, kidCard.link)}
      >
        {info?.thumbnail ? (
          <Image
            src={info.thumbnail}
            alt=""
            width={100}
            height={100}
            unoptimized
            className={cn(kidCard.thumb, kidCard.snapshotThumb, kidCard.webSnapshotThumb)}
          />
        ) : (
          <div
            className={cn(
              kidCard.webTile,
              kidCard.tile,
              kidCard.snapshotTile,
              kidCard.snapshotTileText,
            )}
          >
            <Icon name="camera" size={40} stroke={1.6} />
          </div>
        )}
        <div className={kidCard.main}>
          <h3 className={cn(kidCard.title, kidCard.webTitle)}>
            {info?.title ?? t("openFailed")}
          </h3>
          {info?.gameTitle && (
            <p className={cn(kidCard.metaLine, kidCard.meta)}>
              {info.gameTitle}
            </p>
          )}
          <p className={kidCard.description}>
            {format.dateTime(createdAt, { dateStyle: "medium" })}
          </p>
          <div className={cn(kidCard.webBadges, kidCard.badges)}>
            {isReceived && (
              <span
                className={cn(
                  kidCard.badge,
                  kidCard.badgeText,
                  kidCard.badgeFriend,
                  kidCard.badgeFriendText,
                )}
              >
                {senderName
                  ? t("fromFriend", { name: senderName })
                  : t("fromFriendUnknown")}
              </span>
            )}
            {isNew && (
              <span
                className={cn(
                  kidCard.badge,
                  kidCard.badgeText,
                  kidCard.badgeNew,
                  kidCard.badgeNewText,
                )}
              >
                {t("newBadge")}
              </span>
            )}
          </div>
        </div>
      </OfflineAwareLink>

      <div className={cn(kidCard.webFooter, kidCard.footer)}>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t("deleteConfirm"))) onDelete(view.id);
          }}
          disabled={!isOnline}
          aria-label={t("deleteAction")}
          className={cn(kidCard.webIconButton, kidCard.iconButton, kidCard.iconButtonText)}
        >
          <Icon name="delete" size={20} stroke={2} />
        </button>
        <KidButton asChild size="sm" className={kidCard.play}>
          <OfflineAwareLink href={`/snapshots/${view.id}`}>
            <Icon name="play" size={13} />
            {t("openAction")}
          </OfflineAwareLink>
        </KidButton>
      </div>
    </div>
  );
}
