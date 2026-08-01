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
    <div className="flex w-full flex-col gap-4 pb-4">
      <div className="flex min-w-0 items-center gap-3 lg:grid lg:grid-cols-[300px_1fr] lg:gap-4">
        <div className="flex shrink-0">
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
          className="flex min-w-0 flex-1 items-center justify-between gap-3 lg:max-w-[var(--stage-w)]"
        >
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-extrabold text-ink lg:text-[21px]">
              {title}
            </h1>
          </div>
          {action}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="hidden lg:block">
          {sidebar ?? <DodiFullGame actions={assistantActions} />}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
