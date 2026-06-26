"use client";

import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import type { DecodedFriend } from "@/lib/friends";

import { FriendAvatar } from "./friend-avatar";

interface FriendRowProps {
  friend: DecodedFriend;
  onOpen?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onUnblock?: () => void;
  disabled?: boolean;
}

const ROW_BASE =
  "flex w-full items-center gap-3.5 rounded-[18px] bg-white px-4 py-3 text-left shadow-[0_2px_10px_rgba(34,56,78,0.05)]";

/**
 * The real name wins; the requester's private nickname stands in for an outgoing
 * request until the friend accepts, and once both are known it's shown muted in
 * brackets after the name. The friend code (handle) is never displayed.
 */
function displayParts(friend: DecodedFriend): {
  primary: string;
  suffix: string | null;
} {
  const name = friend.name?.trim();
  const nick = friend.nickname?.trim();
  return {
    primary: name || nick || "—",
    suffix: name && nick ? nick : null,
  };
}

function NameLabel({ primary, suffix }: { primary: string; suffix: string | null }) {
  return (
    <div className="text-[16.5px] font-extrabold text-ink">
      {primary}
      {suffix ? <span className="font-bold text-faint"> ({suffix})</span> : null}
    </div>
  );
}

export function FriendRow({
  friend,
  onOpen,
  onAccept,
  onDecline,
  onCancel,
  onUnblock,
  disabled,
}: FriendRowProps) {
  const t = useTranslations("friends");
  const { primary, suffix } = displayParts(friend);
  // Which parent is still holding things up, from this kid's perspective.
  const awaitingLabel = friend.myParentPending
    ? t("awaitingYourParent")
    : t("awaitingFriendsParent");

  if (friend.status === "accepted") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`${ROW_BASE} transition-all duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(34,56,78,0.1)] active:scale-[0.985]`}
      >
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <div className="min-w-0 flex-1">
          <NameLabel primary={primary} suffix={suffix} />
        </div>
        <Icon name="chevron_right" size={20} className="text-border-strong" />
      </button>
    );
  }

  if (friend.status === "pending" && friend.role === "addressee") {
    return (
      <div className={`${ROW_BASE} outline outline-[1.5px] outline-primary-soft-2`}>
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <div className="min-w-0 flex-1">
          <NameLabel primary={primary} suffix={suffix} />
          <div className="truncate text-[13px] font-bold text-primary">
            {t("wantsToBeFriends")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDecline}
            disabled={disabled}
            aria-label={t("reject")}
            className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
          >
            <Icon name="close" size={16} stroke={2.4} />
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_3px_9px_rgba(47,107,216,0.26)] transition-colors hover:bg-primary-hover active:scale-95 disabled:opacity-50"
          >
            <Icon name="check" size={15} stroke={2.6} />
            {t("accept")}
          </button>
        </div>
      </div>
    );
  }

  if (friend.status === "awaiting_parent" && friend.role === "addressee") {
    // This kid already accepted; the friendship is waiting on a parent.
    return (
      <div className={ROW_BASE}>
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <div className="min-w-0 flex-1">
          <NameLabel primary={primary} suffix={suffix} />
          <div className="truncate text-[13px] font-bold text-faint">
            {t("youAccepted")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-[7px] text-[13px] font-extrabold text-muted-foreground">
            <Icon name="clock" size={13} stroke={2.2} />
            {awaitingLabel}
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            aria-label={t("reject")}
            className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
          >
            <Icon name="close" size={16} stroke={2.4} />
          </button>
        </div>
      </div>
    );
  }

  if (friend.status === "pending" || friend.status === "awaiting_parent") {
    // Outgoing request (this kid asked); awaiting_parent shows the parent gate.
    const pendingLabel =
      friend.status === "awaiting_parent" ? awaitingLabel : t("pending");
    return (
      <div className={ROW_BASE}>
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <div className="min-w-0 flex-1">
          <NameLabel primary={primary} suffix={suffix} />
          <div className="truncate text-[13px] font-bold text-faint">
            {t("requestSent")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-[7px] text-[13px] font-extrabold text-muted-foreground">
            <Icon name="clock" size={13} stroke={2.2} />
            {pendingLabel}
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            aria-label={t("reject")}
            className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
          >
            <Icon name="close" size={16} stroke={2.4} />
          </button>
        </div>
      </div>
    );
  }

  // blocked
  return (
    <div className={`${ROW_BASE} opacity-90`}>
      <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} grayscale />
      <div className="min-w-0 flex-1">
        <NameLabel primary={primary} suffix={suffix} />
        <div className="truncate text-[13px] font-bold text-faint">
          {t("blocked")}
        </div>
      </div>
      <button
        type="button"
        onClick={onUnblock}
        disabled={disabled}
        className="rounded-full bg-muted px-[18px] py-2.5 text-sm font-extrabold text-ink-2 transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-50"
      >
        {t("unblock")}
      </button>
    </div>
  );
}
