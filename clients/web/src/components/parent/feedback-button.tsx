"use client";

import { useTranslations } from "next-intl";

import { navItem } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

/**
 * "Give feedback" at the foot of the parent sidebar, above the account badge.
 * Styled like a nav item; it opens the feedback dialog rather than navigating.
 * Mobile: components/parent/feedback-button.
 */
export function FeedbackButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("feedback");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        navItem.box,
        navItem.text,
        navItem.web,
        navItem.textInactive,
        navItem.webInactive,
        "w-full cursor-pointer text-left",
      )}
    >
      <Icon name="feedback" size={navItem.icon.size} />
      <span>{t("button")}</span>
    </button>
  );
}
