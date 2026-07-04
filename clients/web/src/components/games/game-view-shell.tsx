"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { DodiFullGame } from "@/components/dodi/dodi-full-game";
import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";

interface GameViewShellProps {
  /** Destination of the back button (e.g. "/games"). */
  backHref: string;
  /** Back button label (e.g. the "Games" section title). */
  backLabel: string;
  /** Main heading — the game (or screen) title. */
  title: string;
  /** Optional secondary line under the title. */
  description?: string;
  /** Optional action rendered at the right edge of the title bar (e.g. Remix). */
  action?: ReactNode;
  /** Game content shown beside the Dodi panel (sandbox, remix controls, …). */
  children: ReactNode;
}

/**
 * Shared shell for the kid full-mode game views (play / edit / create).
 *
 * Mirrors the design's `k-create-bar` sitting above `k-create-cols`: a
 * full-width title bar (back button + title + description) on top, with the
 * persistent Dodi voice panel and the game content side-by-side below it.
 */
export function GameViewShell({
  backHref,
  backLabel,
  title,
  description,
  action,
  children,
}: GameViewShellProps) {
  return (
    <div className="flex w-full flex-col gap-4 pb-4">
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[300px_1fr] lg:items-center">
        <div className="flex">
          <KidButton asChild variant="back" size="sm">
            <Link href={backHref}>
              <Icon name="arrow_left" size={15} stroke={2.2} />
              {backLabel}
            </Link>
          </KidButton>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[21px] font-extrabold text-ink">
              {title}
            </h1>
            {description ? (
              <p className="truncate text-sm font-semibold text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <DodiFullGame />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
