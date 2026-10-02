"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  DodiFullGame,
  type GameAssistantAction,
} from "@/components/dodi/dodi-full-game";
import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import { STAGE, stageWidthVars } from "@/lib/games/stage";
import { cn } from "@/lib/utils";
import { gameViewShell } from "@dodi/ui-recipes";

interface GameViewShellProps {
  /** Destination of the back button (e.g. "/games"). */
  backHref: string;
  /** Back button label (e.g. the "Games" section title). */
  backLabel: string;
  /** Main heading — the game (or screen) title. */
  title: string;
  /** Optional action rendered at the right edge of the title bar (e.g. Remix). */
  action?: ReactNode;
  /** Contextual quick actions shown as chips inside the Dodi panel. */
  assistantActions?: GameAssistantAction[];
  /**
   * Replaces the Dodi panel in the left column (lg+). The public game page
   * puts its sign-in/popular cards here so both views share one layout and
   * the title bar, action buttons and canvas all align identically.
   */
  sidebar?: ReactNode;
  /** Game content shown beside the Dodi panel (sandbox, remix controls, …). */
  children: ReactNode;
}

/**
 * Shared shell for the kid full-mode game views (play / edit / create).
 *
 * Mirrors the design's `k-create-bar` sitting above `k-create-cols`: a
 * full-width title bar (back button + title) on top, with the persistent Dodi
 * voice panel and the game content side-by-side below it.
 *
 * Below `lg` the shell collapses to a compact single-column layout: the title
 * sits inline next to the back button, and the Dodi panel is hidden — dodi
 * stays reachable as the compact header avatar (see KidLayout).
 */
export function GameViewShell({
  backHref,
  backLabel,
  title,
  action,
  assistantActions,
  sidebar,
  children,
}: GameViewShellProps) {
  return (
    <div className={cn(gameViewShell.webRoot, gameViewShell.root)}>
      <div className={cn(gameViewShell.webBar, gameViewShell.bar)}>
        <div className={cn(gameViewShell.webBack, gameViewShell.back)}>
          <KidButton asChild variant="back" size="sm">
            <Link href={backHref}>
              <Icon name="arrow_left" size={15} stroke={2.2} />
              {backLabel}
            </Link>
          </KidButton>
        </div>
        {/* Capped at the stage width on lg so the right-aligned action lines up
            with the game canvas's right edge below (same column, same var). */}
        <div
          style={stageWidthVars(STAGE.reservedKid)}
          className={cn(gameViewShell.webTitleRow, gameViewShell.titleRow)}
        >
          <div className={gameViewShell.titleWrap}>
            <h1 className={cn(gameViewShell.webTitle, gameViewShell.title)}>
              {title}
            </h1>
          </div>
          {action}
        </div>
      </div>

      <div className={cn(gameViewShell.webCols, gameViewShell.cols)}>
        <div className={gameViewShell.webSide}>
          {sidebar ?? <DodiFullGame actions={assistantActions} />}
        </div>
        <div className={gameViewShell.content}>{children}</div>
      </div>
    </div>
  );
}
