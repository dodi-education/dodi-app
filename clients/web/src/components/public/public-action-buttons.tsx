"use client";

import { useTranslations } from "next-intl";

import { useLoginDialog } from "@/components/auth/login-dialog";
import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import { PUBLIC_GAME_RESET_EVENT } from "@/components/public/public-game-play";

/**
 * The photo + reset buttons on the public game page. Reset works without an
 * account (it just remounts the sandbox — anonymous play has no saved state).
 * The photo needs one (snapshots are E2EE), so it doubles as a conversion
 * surface: clicking it opens the login dialog.
 */
export function PublicActionButtons() {
  const t = useTranslations("publicGames");
  const { openLoginDialog } = useLoginDialog();

  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <KidButton
        variant="icon"
        size="none"
        onClick={openLoginDialog}
        title={t("actionPhoto")}
        aria-label={t("actionPhoto")}
        className="rounded-[12px] border border-border-strong bg-white text-ink-2 shadow-card hover:bg-primary-soft hover:text-primary"
      >
        <Icon name="camera" size={20} stroke={2} />
      </KidButton>
      <KidButton
        variant="icon"
        size="none"
        onClick={() =>
          window.dispatchEvent(new CustomEvent(PUBLIC_GAME_RESET_EVENT))
        }
        title={t("actionReset")}
        aria-label={t("actionReset")}
        className="rounded-[12px] border border-danger/30 bg-white text-danger shadow-card hover:bg-danger-soft"
      >
        <Icon name="delete" size={20} stroke={2} />
      </KidButton>
    </div>
  );
}
