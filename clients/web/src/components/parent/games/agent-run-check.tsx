"use client";

import { useTranslations } from "next-intl";

import { AgentRunFrames } from "@/components/parent/games/agent-run-frames";
import { Icon } from "@/components/shared/icon";
import type { AgentRunCheck } from "@/lib/games/agent-run-log";
import { cn } from "@/lib/utils";

interface AgentRunCheckItemProps {
  check: AgentRunCheck;
}

interface IssueListProps {
  title: string;
  items: string[];
  tone: "danger" | "warning" | "muted";
}

function IssueList({ title, items, tone }: IssueListProps) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5">
      <p
        className={cn(
          "text-[11.5px] font-semibold",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-warning",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {title}
      </p>
      <ul className="text-muted-foreground mt-0.5 list-disc space-y-0.5 pl-4 text-[11.5px] leading-snug">
        {items.map((item, i) => (
          <li key={i} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One screenshot check on the run timeline: frames, then what it found. */
export function AgentRunCheckItem({ check }: AgentRunCheckItemProps) {
  const t = useTranslations("gameStudio");
  const hasProblems =
    check.hasFailed || !check.isReady || check.errors.length > 0;

  return (
    <div>
      <p className="text-ink-2 flex items-center gap-1.5 text-[12.5px] font-semibold">
        <Icon name="camera" size={14} className="text-primary shrink-0" />
        {t("runLogCheckTitle")}
        {!check.hasFailed && (
          <span
            className={cn(
              "text-[11.5px] font-medium",
              hasProblems ? "text-destructive" : "text-success",
            )}
          >
            {check.isReady ? t("runLogCheckReady") : t("runLogCheckNotReady")}
          </span>
        )}
      </p>
      {check.requestedSteps.length > 0 && (
        <p className="text-faint mt-0.5 text-[11.5px]">
          {t("runLogCheckRequested", {
            steps: check.requestedSteps.join(", "),
          })}
        </p>
      )}
      {check.hasFailed ? (
        <p className="text-muted-foreground mt-0.5 text-[11.5px]">
          {t("runLogCheckFailed")}
        </p>
      ) : check.frames.length > 0 ? (
        <AgentRunFrames frames={check.frames} />
      ) : (
        <p className="text-faint mt-0.5 text-[11.5px] italic">
          {check.hasDroppedFrames
            ? t("runLogFramesDropped")
            : t("runLogNoFrames")}
        </p>
      )}
      {check.frames.length > 0 && check.hasDroppedFrames && (
        <p className="text-faint mt-0.5 text-[11.5px] italic">
          {t("runLogFramesPartlyDropped")}
        </p>
      )}
      <IssueList title={t("runLogErrors")} items={check.errors} tone="danger" />
      <IssueList
        title={t("runLogLayoutIssues")}
        items={check.layoutIssues}
        tone="warning"
      />
      <IssueList
        title={t("runLogWarnings")}
        items={check.warnings}
        tone="muted"
      />
    </div>
  );
}
