"use client";

import { useTranslations } from "next-intl";

import {
  type PublishStepStatus,
  type PublishStepperState,
  publishStepStatuses,
} from "@dodi/client-state/game-publication";

import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";
import { publishStepper } from "@dodi/ui-recipes";

type StepStatus = PublishStepStatus;

const s = publishStepper;
const DOT_CLASS: Record<StepStatus, string> = {
  done: cn(s.done, s.doneText),
  current: cn(s.current, s.currentText, s.webCurrentRing),
  warning: cn(s.current, s.currentText, s.webCurrentRing),
  danger: cn(s.danger, s.dangerText, s.webDangerRing),
  upcoming: cn(s.upcoming, s.upcomingText),
};

const DOT_ICON: Partial<Record<StepStatus, IconName>> = {
  done: "check",
  current: "clock",
  warning: "alert",
  danger: "ban",
};

/**
 * Submitted → Safety review → Live. Answers "where is my game?" at a glance,
 * so the parent does not read the dialog's buttons as a next step to take.
 */
export function PublishStatusStepper({ state }: { state: PublishStepperState }) {
  const t = useTranslations("gameStudio");
  const statuses = publishStepStatuses(state);
  const labels = [t("publishStepSubmitted"), t("publishStepReview"), t("publishStepLive")];

  return (
    <ol aria-label={t("publishProgressLabel")} className={cn(s.webList, s.list)}>
      {labels.map((label, i) => {
        const status = statuses[i];
        const icon = DOT_ICON[status];
        return (
          <li
            key={label}
            aria-current={status === "current" ? "step" : undefined}
            className={cn(s.webItem, s.item)}
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  s.line,
                  s.webLine,
                  status === "upcoming" ? s.lineUpcoming : s.lineDone,
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                s.webDot,
                s.dot,
                s.dotText,
                DOT_CLASS[status],
              )}
            >
              {icon ? <Icon name={icon} size={14} /> : i + 1}
            </span>
            <span
              className={cn(
                s.label,
                status === "upcoming" ? s.labelUpcoming : s.labelDone,
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
