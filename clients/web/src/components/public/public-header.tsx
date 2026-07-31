"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";

import { useLoginDialog } from "@/components/auth/login-dialog";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Button } from "@/components/ui/button";
import { STAGE, stageWidthVars } from "@/lib/games/stage";
import { siteUrl } from "@/lib/site-links";

/**
 * Top bar of the public game page: wordmark to the landing site, sign-in CTA.
 * Mirrors GameViewShell's geometry (300px sidebar column + title row capped at
 * the stage width) so the sign-in button lines up with the game canvas's right
 * edge, exactly like the action buttons in the title bar below.
 */
export function PublicHeader() {
  const tc = useTranslations("common");
  const locale = useLocale();
  const { openLoginDialog } = useLoginDialog();

  return (
    // px-4 sits OUTSIDE the max-w-6xl box, exactly like the <main> wrapper —
    // padding inside the capped box would shift the grid 16px right on wide
    // viewports and break the sign-in button's alignment with the canvas.
    <header className="sticky top-0 z-40 border-b border-border/60 bg-white/80 px-4 backdrop-blur-md">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex h-16 items-center justify-between gap-3 lg:grid lg:grid-cols-[300px_1fr] lg:gap-4">
          <a
            href={siteUrl("home", locale)}
            className="shrink-0"
            aria-label="dodi"
          >
            <Image
              src="/images/dodi-logo.svg"
              alt="dodi"
              width={96}
              height={32}
              priority
              className="h-8 w-auto"
            />
          </a>
          <div
            style={stageWidthVars(STAGE.reservedKid)}
            className="flex items-center justify-end gap-2 lg:max-w-[var(--stage-w)]"
          >
            {/* Cookie-only for anonymous visitors; a router.refresh re-renders
                the server page (title, popular rail, metadata) in the new locale. */}
            <LanguageSwitcher />
            <Button onClick={openLoginDialog}>{tc("signIn")}</Button>
          </div>
        </div>
      </div>
    </header>
  );
}
