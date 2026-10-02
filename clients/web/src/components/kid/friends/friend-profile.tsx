"use client";

import { useTranslations } from "next-intl";
import { friendProfile } from "@dodi/ui-recipes";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { KidButton } from "@/components/kid/kid-button";
import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";
import type { DecodedFriend } from "@/lib/friends";

import { FriendAvatar } from "./friend-avatar";

interface FriendProfileProps {
  friend: DecodedFriend;
  busy: boolean;
  onBack: () => void;
  onBlock: () => void;
  onRemove: () => void;
}

export function FriendProfile({
  friend,
  busy,
  onBack,
  onBlock,
  onRemove,
}: FriendProfileProps) {
  const t = useTranslations("friends");
  const { formatDate, formatDateOnly } = useDateFormat();
  const name = friend.name?.trim() || friend.nickname?.trim() || "—";
  const nickname =
    friend.name?.trim() && friend.nickname?.trim()
      ? friend.nickname.trim()
      : null;
  // Birthdate is a floating calendar date — format day-stable (no tz shift).
  const birthday = formatDateOnly(friend.birthdate) ?? t("unknownValue");
  const since = formatDate(friend.updatedAt) || t("unknownValue");

  return (
    <div className={friendProfile.root}>
      <KidButton variant="back" size="sm" onClick={onBack} className={friendProfile.back}>
        <Icon name="arrow_left" stroke={2.2} />
        {t("kidBack")}
      </KidButton>

      <div className={cn(friendProfile.card, friendProfile.webCard)}>
        <FriendAvatar label={name} avatarConfig={friend.avatarConfig} size={96} />
        <div className={friendProfile.name}>
          {name}
        </div>
        {nickname ? (
          <div className={friendProfile.nickname}>
            ({nickname})
          </div>
        ) : null}
        <span
          className={cn(
            friendProfile.badge,
            friendProfile.badgeText,
            friendProfile.webBadge,
          )}
        >
          <Icon name="check" size={13} stroke={3} />
          {t("friendBadge")}
        </span>

        <div className={friendProfile.facts}>
          <div className={cn(friendProfile.fact, friendProfile.webFact)}>
            <span className={cn(friendProfile.factIcon, friendProfile.webFactIcon)}>
              <Icon name="cake" size={18} stroke={1.8} />
            </span>
            <span className={friendProfile.factLabel}>
              {t("birthday")}
            </span>
            <span className={friendProfile.factValue}>
              {birthday}
            </span>
          </div>
          <div
            className={cn(
              friendProfile.fact,
              friendProfile.webFact,
              friendProfile.factDivider,
            )}
          >
            <span className={cn(friendProfile.factIcon, friendProfile.webFactIcon)}>
              <Icon name="friends" size={18} stroke={1.8} />
            </span>
            <span className={friendProfile.factLabel}>
              {t("friendsSince")}
            </span>
            <span className={friendProfile.factValue}>
              {since}
            </span>
          </div>
        </div>
      </div>

      <div className={cn(friendProfile.actions, friendProfile.webActions)}>
        <button
          type="button"
          onClick={onBlock}
          disabled={busy}
          className={cn(
            friendProfile.action,
            friendProfile.webAction,
            friendProfile.actionText,
            friendProfile.blockText,
            friendProfile.webBlock,
          )}
        >
          <Icon name="ban" size={16} stroke={2} />
          {t("block")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className={cn(
            friendProfile.action,
            friendProfile.webAction,
            friendProfile.actionText,
            friendProfile.removeText,
            friendProfile.webRemove,
          )}
        >
          <Icon name="delete" size={16} stroke={2} />
          {t("removeFriend")}
        </button>
      </div>
    </div>
  );
}
