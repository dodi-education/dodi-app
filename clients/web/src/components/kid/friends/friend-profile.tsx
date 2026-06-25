"use client";

import { useLocale, useTranslations } from "next-intl";

import { KidButton } from "@/components/kid/kid-button";
import { Icon } from "@/components/shared/icon";
import type { DecodedFriend } from "@/lib/friends";

import { FriendAvatar } from "./friend-avatar";

interface FriendProfileProps {
  friend: DecodedFriend;
  busy: boolean;
  onBack: () => void;
  onBlock: () => void;
  onRemove: () => void;
}

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function FriendProfile({
  friend,
  busy,
  onBack,
  onBlock,
  onRemove,
}: FriendProfileProps) {
  const t = useTranslations("friends");
  const locale = useLocale();
  const name = friend.name?.trim() || friend.nickname?.trim() || "—";
  const nickname =
    friend.name?.trim() && friend.nickname?.trim()
      ? friend.nickname.trim()
      : null;
  const birthday = formatDate(friend.birthdate, locale) ?? t("unknownValue");
  const since = formatDate(friend.updatedAt, locale) ?? t("unknownValue");

  return (
    <div className="mx-auto w-full max-w-[460px] px-5 pb-8">
      <KidButton variant="back" size="sm" onClick={onBack} className="pl-3">
        <Icon name="arrow_left" stroke={2.2} />
        {t("profileBack")}
      </KidButton>

      <div className="mt-1.5 flex flex-col items-center rounded-[26px] bg-white px-6 pb-7 pt-8 shadow-[0_4px_18px_rgba(34,56,78,0.06)]">
        <FriendAvatar label={name} size={96} />
        <div className="mt-4 text-[26px] font-extrabold tracking-tight text-ink">
          {name}
        </div>
        {nickname ? (
          <div className="mt-0.5 text-[15px] font-bold text-faint">
            ({nickname})
          </div>
        ) : null}
        <span className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-[12.5px] font-extrabold text-success">
          <Icon name="check" size={13} stroke={3} />
          {t("friendBadge")}
        </span>

        <div className="mt-6 w-full overflow-hidden rounded-[18px] bg-muted">
          <div className="flex items-center gap-3 px-[18px] py-[15px]">
            <span className="flex shrink-0 text-faint">
              <Icon name="cake" size={18} stroke={1.8} />
            </span>
            <span className="text-[14.5px] font-bold text-muted-foreground">
              {t("birthday")}
            </span>
            <span className="ml-auto text-right text-[14.5px] font-extrabold text-ink">
              {birthday}
            </span>
          </div>
          <div className="flex items-center gap-3 border-t border-border px-[18px] py-[15px]">
            <span className="flex shrink-0 text-faint">
              <Icon name="friends" size={18} stroke={1.8} />
            </span>
            <span className="text-[14.5px] font-bold text-muted-foreground">
              {t("friendsSince")}
            </span>
            <span className="ml-auto text-right text-[14.5px] font-extrabold text-ink">
              {since}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2.5">
        <button
          type="button"
          onClick={onBlock}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border-strong bg-white px-3.5 py-3 text-[14.5px] font-extrabold text-ink-2 transition-colors hover:border-ink-2 hover:text-ink disabled:opacity-50"
        >
          <Icon name="ban" size={16} stroke={2} />
          {t("block")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border-strong bg-white px-3.5 py-3 text-[14.5px] font-extrabold text-danger transition-colors hover:border-danger hover:bg-danger-soft disabled:opacity-50"
        >
          <Icon name="delete" size={16} stroke={2} />
          {t("removeFriend")}
        </button>
      </div>
    </div>
  );
}
