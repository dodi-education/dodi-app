"use client";

import { useTranslations } from "next-intl";

import { friendDisplayParts } from "@dodi/client-state/friends";
import { friendRow } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";
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

const ROW_BASE = cn(friendRow.box, friendRow.web);
const DECLINE = cn(friendRow.decline, friendRow.declineText, friendRow.webDecline);
const WAITING = cn(friendRow.waiting, friendRow.waitingText, friendRow.webWaiting);
const STATUS_MUTED = cn(friendRow.status, friendRow.statusMuted, friendRow.webStatus);

function NameLabel({ primary, suffix }: { primary: string; suffix: string | null }) {
  return (
    <div className={friendRow.name}>
      {primary}
      {suffix ? <span className={friendRow.nameSuffix}> ({suffix})</span> : null}
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
  const { primary, suffix } = friendDisplayParts(friend);
  // Which parent is still holding things up, from this kid's perspective.
  const awaitingLabel = friend.myParentPending
    ? t("awaitingYourParent")
    : t("awaitingFriendsParent");

  if (friend.status === "accepted") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(ROW_BASE, friendRow.webOpen)}
      >
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <div className={friendRow.main}>
          <NameLabel primary={primary} suffix={suffix} />
        </div>
        <Icon name="chevron_right" size={20} className="text-border-strong" />
      </button>
    );
  }

  if (friend.status === "pending" && friend.role === "addressee") {
    return (
      <div className={cn(ROW_BASE, friendRow.webIncoming)}>
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <div className={friendRow.main}>
          <NameLabel primary={primary} suffix={suffix} />
          <div className={cn(friendRow.status, friendRow.statusRequest, friendRow.webStatus)}>
            {t("wantsToBeFriends")}
          </div>
        </div>
        <div className={cn(friendRow.actions, friendRow.webActions)}>
          <button
            type="button"
            onClick={onDecline}
            disabled={disabled}
            aria-label={t("reject")}
            className={DECLINE}
          >
            <Icon name="close" size={16} stroke={2.4} />
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={disabled}
            className={cn(friendRow.accept, friendRow.acceptText, friendRow.webAccept)}
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
        <div className={friendRow.main}>
          <NameLabel primary={primary} suffix={suffix} />
          <div className={STATUS_MUTED}>
            {t("youAccepted")}
          </div>
        </div>
        <div className={cn(friendRow.actions, friendRow.webActions)}>
          <span className={WAITING}>
            <Icon name="clock" size={13} stroke={2.2} />
            {awaitingLabel}
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            aria-label={t("reject")}
            className={DECLINE}
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
        <div className={friendRow.main}>
          <NameLabel primary={primary} suffix={suffix} />
          <div className={STATUS_MUTED}>
            {t("requestSent")}
          </div>
        </div>
        <div className={cn(friendRow.actions, friendRow.webActions)}>
          <span className={WAITING}>
            <Icon name="clock" size={13} stroke={2.2} />
            {pendingLabel}
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            aria-label={t("reject")}
            className={DECLINE}
          >
            <Icon name="close" size={16} stroke={2.4} />
          </button>
        </div>
      </div>
    );
  }

  // blocked
  return (
    <div className={cn(ROW_BASE, friendRow.blocked)}>
      <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} grayscale />
      <div className={friendRow.main}>
        <NameLabel primary={primary} suffix={suffix} />
        <div className={STATUS_MUTED}>
          {t("blocked")}
        </div>
      </div>
      <button
        type="button"
        onClick={onUnblock}
        disabled={disabled}
        className={cn(friendRow.unblock, friendRow.unblockText, friendRow.webUnblock)}
      >
        {t("unblock")}
      </button>
    </div>
  );
}
