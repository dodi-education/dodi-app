"use client";

import { useTranslations } from "next-intl";

import type { PublicationRejectionReason } from "@dodi/protocol/publication-review";

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
    <ul className="flex flex-col gap-2">
      {reasons.map((reason, i) => (
        <li
          key={`${reason.code}-${i}`}
          className={
            isPermanent
              ? "rounded-lg bg-danger-soft px-3 py-2 text-xs"
              : "rounded-lg bg-warning-soft px-3 py-2 text-xs"
          }
        >
          <span
            className={
              isPermanent ? "font-semibold text-danger" : "font-semibold text-warning"
            }
          >
            {t(`publishReason_${reason.code}`)}
          </span>
          {reason.note && <p className="mt-0.5 text-muted-foreground">{reason.note}</p>}
        </li>
      ))}
    </ul>
  );
}
