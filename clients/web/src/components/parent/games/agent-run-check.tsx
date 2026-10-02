"use client";

import { useTranslations } from "next-intl";

import { AgentRunFrames } from "@/components/parent/games/agent-run-frames";
import { Icon } from "@/components/shared/icon";
import type { AgentRunCheck } from "@dodi/studio/agent-run-log";
import { cn } from "@/lib/utils";
import { agentRunCheck } from "@dodi/ui-recipes";

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
    <div className={agentRunCheck.issues}>
      <p
        className={cn(
          agentRunCheck.issuesTitle,
          tone === "danger" && agentRunCheck.issuesDanger,
          tone === "warning" && agentRunCheck.issuesWarning,
          tone === "muted" && agentRunCheck.issuesMuted,
        )}
      >
        {title}
      </p>
      <ul className={cn(agentRunCheck.issueList, agentRunCheck.issueText, agentRunCheck.webIssueList)}>
        {items.map((item, i) => (
          <li key={i} className={agentRunCheck.webIssue}>
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
      <p className={cn(agentRunCheck.webTitle, agentRunCheck.title, agentRunCheck.titleText)}>
        <Icon name="camera" size={14} className="text-primary shrink-0" />
        {t("runLogCheckTitle")}
        {!check.hasFailed && (
          <span
            className={cn(
              agentRunCheck.status,
              hasProblems ? agentRunCheck.statusBad : agentRunCheck.statusGood,
            )}
          >
            {check.isReady ? t("runLogCheckReady") : t("runLogCheckNotReady")}
          </span>
        )}
      </p>
      {check.requestedSteps.length > 0 && (
        <p className={agentRunCheck.requested}>
          {t("runLogCheckRequested", {
            steps: check.requestedSteps.join(", "),
          })}
        </p>
      )}
      {check.hasFailed ? (
        <p className={agentRunCheck.failed}>
          {t("runLogCheckFailed")}
        </p>
      ) : check.frames.length > 0 ? (
        <AgentRunFrames frames={check.frames} />
      ) : (
        <p className={agentRunCheck.noFrames}>
          {check.hasDroppedFrames
            ? t("runLogFramesDropped")
            : t("runLogNoFrames")}
        </p>
      )}
      {check.frames.length > 0 && check.hasDroppedFrames && (
        <p className={agentRunCheck.noFrames}>
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
