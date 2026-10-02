"use client";

import { useTranslations } from "next-intl";

import type { PublicationRejectionReason } from "@dodi/protocol/publication-review";
import { rejectionReason } from "@dodi/ui-recipes";

import { cn } from "@/lib/utils";

interface PublishRejectionReasonsProps {
  reasons: PublicationRejectionReason[];
  /** Hard rejections read as final (danger), soft ones as fixable (warning). */
  isPermanent: boolean;
}

/** The review's findings, one card per reason with the agent's note. */
export function PublishRejectionReasons({ reasons, isPermanent }: PublishRejectionReasonsProps) {
  const t = useTranslations("gameStudio");
  if (reasons.length === 0) return null;

  return (
    <ul className={cn(rejectionReason.webList, rejectionReason.list)}>
      {reasons.map((reason, i) => (
        <li
          key={`${reason.code}-${i}`}
          className={cn(
            rejectionReason.box,
            isPermanent ? rejectionReason.permanent : rejectionReason.fixable,
            rejectionReason.text,
          )}
        >
          <span
            className={cn(
              rejectionReason.title,
              isPermanent ? rejectionReason.titlePermanent : rejectionReason.titleFixable,
            )}
          >
            {t(`publishReason_${reason.code}`)}
          </span>
          {reason.note && <p className={rejectionReason.note}>{reason.note}</p>}
        </li>
      ))}
    </ul>
  );
}
