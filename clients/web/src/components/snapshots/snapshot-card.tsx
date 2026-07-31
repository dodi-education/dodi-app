"use client";

import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { OfflineAwareLink } from "@/components/shared/offline-aware-link";
import { KidButton } from "@/components/kid/kid-button";
import { useOnline } from "@/hooks/use-online";
import type { DecodedSnapshot } from "@/hooks/use-snapshots";

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
  const isNew = isReceived && view.viewedAt === null;
  const createdAt = new Date(info?.createdAt ?? view.createdAt);

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-[18px] pb-4 shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
      <OfflineAwareLink
        href={`/snapshots/${view.id}`}
        className="group flex items-start gap-3.5 rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2"
      >
        {info?.thumbnail ? (
          <Image
            src={info.thumbnail}
            alt=""
            width={100}
            height={100}
            unoptimized
            className="size-[100px] shrink-0 rounded-[16px] border border-border object-cover"
          />
        ) : (
          <div className="flex size-[100px] shrink-0 items-center justify-center rounded-[16px] bg-primary-soft text-primary">
            <Icon name="camera" size={40} stroke={1.6} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[16.5px] font-extrabold leading-tight text-ink group-hover:text-primary">
            {info?.title ?? t("openFailed")}
          </h3>
          {info?.gameTitle && (
            <p className="mt-0.5 text-[12.5px] font-bold text-faint">
              {info.gameTitle}
            </p>
          )}
          <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-muted-foreground">
            {format.dateTime(createdAt, { dateStyle: "medium" })}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {isReceived && (
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11.5px] font-extrabold text-primary">
                {senderName
                  ? t("fromFriend", { name: senderName })
                  : t("fromFriendUnknown")}
              </span>
            )}
            {isNew && (
              <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[11.5px] font-extrabold text-danger">
                {t("newBadge")}
              </span>
            )}
          </div>
        </div>
      </OfflineAwareLink>

      <div className="mt-auto flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t("deleteConfirm"))) onDelete(view.id);
          }}
          disabled={!isOnline}
          aria-label={t("deleteAction")}
          className="flex size-11 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:opacity-40"
        >
          <Icon name="delete" size={20} stroke={2} />
        </button>
        <KidButton asChild size="sm" className="px-6">
          <OfflineAwareLink href={`/snapshots/${view.id}`}>
            <Icon name="play" size={13} />
            {t("openAction")}
          </OfflineAwareLink>
        </KidButton>
      </div>
    </div>
  );
}
