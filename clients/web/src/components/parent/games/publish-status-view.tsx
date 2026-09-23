"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { useDateFormat } from "@/components/providers/date-format-provider";
import type { Game } from "@dodi/types/database";

/**
 * The review worker runs every 10 minutes and gives up on an item after three
 * failed agent attempts, which then waits for a person. Past this age a
 * submission is stuck rather than queued, and the copy says so.
 */
const REVIEW_SLOW_AFTER_MS = 60 * 60 * 1000;

interface PublishStatusViewProps {
  state: "in-review" | "published";
  publication: Game;
  /** The parent changed the game's code since this copy was submitted. */
  isEditedSinceSubmit: boolean;
  /** Outcome emails are on (the default), so we can promise one. */
  isOutcomeEmailOn: boolean;
  monthlyLimit: number;
  onResubmit: () => void;
}

/**
 * Read-only status of a submission that needs nothing from the parent: what
 * happens next, what was submitted, and (tucked away, with its cost spelled
 * out) how to send a newer version.
 */
export function PublishStatusView({
  state,
  publication,
  isEditedSinceSubmit,
  isOutcomeEmailOn,
  monthlyLimit,
  onResubmit,
}: PublishStatusViewProps) {
  const t = useTranslations("gameStudio");
  const { formatDateTime } = useDateFormat();
  const [openedAt] = useState(() => Date.now());

  const requestedAt = publication.publication_requested_at;
  const isSlow =
    state === "in-review" &&
    requestedAt !== null &&
    openedAt - new Date(requestedAt).getTime() > REVIEW_SLOW_AFTER_MS;
  const isLive = state === "published";

  return (
    <div className="flex flex-col gap-3">
      {isLive ? (
        <div className="flex gap-2.5 rounded-lg bg-success-soft px-3 py-2.5 text-xs">
          <Icon name="success" size={18} className="shrink-0 text-success" />
          <div className="flex flex-col gap-2">
            <p className="text-ink-2">{t("publishLiveBody")}</p>
            <Link
              href={`/parent/games/${publication.id}`}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              {t("publishViewOnDiscover")}
              <Icon name="chevron_right" size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-xs">
          <Icon name="clock" size={18} className="shrink-0 text-warning" />
          <div className="flex flex-col gap-1 text-ink-2">
            <p>{isSlow ? t("publishReviewSlow") : t("publishReviewEta")}</p>
            <p>{isOutcomeEmailOn ? t("publishNotifyEmail") : t("publishNotifyHere")}</p>
          </div>
        </div>
      )}

      <p className="text-[11px] text-faint">
        {t(isLive ? "publishLiveMeta" : "publishSubmittedMeta", {
          date: requestedAt ? formatDateTime(requestedAt) : "",
          min: publication.target_age_min ?? "?",
          max: publication.target_age_max ?? "?",
        })}
      </p>

      {isEditedSinceSubmit && (
        <div className="flex gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-ink-2">
          <Icon name="info" size={16} className="shrink-0 text-muted-foreground" />
          <p>{isLive ? t("publishEditedSinceLive") : t("publishEditedSinceSubmit")}</p>
        </div>
      )}

      <details className="group rounded-lg border border-border px-3" open={isEditedSinceSubmit}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-ink-2 [&::-webkit-details-marker]:hidden">
          <Icon
            name="chevron_right"
            size={14}
            className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          {isLive ? t("publishUpdateToggleLive") : t("publishUpdateToggle")}
        </summary>
        <div className="flex flex-col items-start gap-2.5 pb-3">
          <p className="text-xs text-muted-foreground">
            {t(isLive ? "publishUpdateLiveHint" : "publishUpdateInReviewHint", {
              limit: monthlyLimit,
            })}
          </p>
          <Button variant="outline" onClick={onResubmit}>
            <Icon name="refresh" size={16} />
            {t("publishResubmit")}
          </Button>
        </div>
      </details>
    </div>
  );
}
