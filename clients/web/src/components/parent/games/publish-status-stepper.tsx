"use client";

import { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

/** Where a submission stands, as the three-step track shows it. */
export type PublishStepperState = "in-review" | "changes-requested" | "rejected" | "published";

type StepStatus = "done" | "current" | "warning" | "danger" | "upcoming";

function stepStatuses(state: PublishStepperState): [StepStatus, StepStatus, StepStatus] {
  switch (state) {
    case "in-review":
      return ["done", "current", "upcoming"];
    case "changes-requested":
      return ["done", "warning", "upcoming"];
    case "rejected":
      return ["done", "danger", "upcoming"];
    case "published":
      return ["done", "done", "done"];
  }
}

const DOT_CLASS: Record<StepStatus, string> = {
  done: "bg-primary text-primary-foreground",
  current: "bg-warning-soft text-warning ring-2 ring-warning",
  warning: "bg-warning-soft text-warning ring-2 ring-warning",
  danger: "bg-danger-soft text-danger ring-2 ring-danger",
  upcoming: "bg-muted text-faint",
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
  const statuses = stepStatuses(state);
  const labels = [t("publishStepSubmitted"), t("publishStepReview"), t("publishStepLive")];

  return (
    <ol aria-label={t("publishProgressLabel")} className="flex items-start">
      {labels.map((label, i) => {
        const status = statuses[i];
        const icon = DOT_ICON[status];
        return (
          <li
            key={label}
            aria-current={status === "current" ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2",
                  status === "upcoming" ? "bg-muted" : "bg-primary",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex size-7 items-center justify-center rounded-full text-xs font-bold",
                DOT_CLASS[status],
              )}
            >
              {icon ? <Icon name={icon} size={14} /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[11px] font-semibold",
                status === "upcoming" ? "text-faint" : "text-ink-2",
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
