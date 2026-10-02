"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { cn } from "@/lib/utils";
import { isPublicationReviewSlow } from "@dodi/client-state/game-publication";
import { dialogField, publishCallout, publishDisclosure } from "@dodi/ui-recipes";
import type { Game } from "@dodi/types/database";

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
  const isSlow = isPublicationReviewSlow(state, requestedAt, openedAt);
  const isLive = state === "published";

  return (
    <div className={cn(publishCallout.webStack, publishCallout.stack)}>
      {isLive ? (
        <div className={cn(publishCallout.web, publishCallout.box, publishCallout.success, publishCallout.text)}>
          <Icon name="success" size={18} className="shrink-0 text-success" />
          <div className={cn(publishCallout.webBody, publishCallout.body)}>
            <p className={publishCallout.bodyText}>{t("publishLiveBody")}</p>
            <Link
              href={`/parent/games/${publication.id}`}
              className={cn(publishCallout.webLink, publishCallout.link, publishCallout.linkText)}
            >
              {t("publishViewOnDiscover")}
              <Icon name="chevron_right" size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <div className={cn(publishCallout.web, publishCallout.box, publishCallout.warning, publishCallout.text)}>
          <Icon name="clock" size={18} className="shrink-0 text-warning" />
          <div className={cn(publishCallout.webBody, publishCallout.bodyTight, publishCallout.bodyText)}>
            <p>{isSlow ? t("publishReviewSlow") : t("publishReviewEta")}</p>
            <p>{isOutcomeEmailOn ? t("publishNotifyEmail") : t("publishNotifyHere")}</p>
          </div>
        </div>
      )}

      <p className={dialogField.hint}>
        {t(isLive ? "publishLiveMeta" : "publishSubmittedMeta", {
          date: requestedAt ? formatDateTime(requestedAt) : "",
          min: publication.target_age_min ?? "?",
          max: publication.target_age_max ?? "?",
        })}
      </p>

      {isEditedSinceSubmit && (
        <div className={cn(publishCallout.web, publishCallout.compact, publishCallout.info, publishCallout.text, publishCallout.bodyText)}>
          <Icon name="info" size={16} className="shrink-0 text-muted-foreground" />
          <p>{isLive ? t("publishEditedSinceLive") : t("publishEditedSinceSubmit")}</p>
        </div>
      )}

      <details className={cn(publishDisclosure.webRoot, publishDisclosure.root)} open={isEditedSinceSubmit}>
        <summary className={cn(publishDisclosure.webSummary, publishDisclosure.summary, publishDisclosure.summaryText)}>
          <Icon
            name="chevron_right"
            size={14}
            className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          {isLive ? t("publishUpdateToggleLive") : t("publishUpdateToggle")}
        </summary>
        <div className={cn(publishDisclosure.webBody, publishDisclosure.body)}>
          <p className={dialogField.note}>
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
