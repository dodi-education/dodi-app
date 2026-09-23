"use client";

import { useTranslations } from "next-intl";

import { AgentRunCheckItem } from "@/components/parent/games/agent-run-check";
import {
  type AgentRunEntry,
  type AgentRunLog,
  formatRunClock,
} from "@/lib/games/agent-run-log";
import type { AgentStep } from "@dodi/types/agent-progress";

interface AgentRunTimelineProps {
  run: AgentRunLog;
  /**
   * The build is still running: its newest narration block is already shown
   * by the studio's live narration line, so the timeline leaves it out.
   */
  isLive?: boolean;
}

function useStepLabel(): (step: AgentStep) => string {
  const t = useTranslations("gameStudio");
  return (step) => {
    const map: Record<AgentStep, string> = {
      reading_docs: t("runLogStepReadingDocs"),
      generating_image: t("runLogStepGeneratingImage"),
      generating_preview: t("runLogStepGeneratingPreview"),
      writing_code: t("runLogStepWritingCode"),
      validating: t("runLogStepValidating"),
      fixing_validation: t("runLogStepFixingValidation"),
      visual_check: t("runLogStepVisualCheck"),
      finalizing: t("runLogStepFinalizing"),
    };
    return map[step];
  };
}

/** What the game agent did in one build, in order, with offsets from its start. */
export function AgentRunTimeline({
  run,
  isLive = false,
}: AgentRunTimelineProps) {
  const stepLabel = useStepLabel();
  const last = run.entries[run.entries.length - 1];
  const entries: AgentRunEntry[] = run.entries.filter(
    (e) =>
      !(e.kind === "narration" && (!e.text.trim() || (isLive && e === last))),
  );
  if (entries.length === 0) return null;

  return (
    <ol className="border-border mt-1.5 space-y-2 border-l pl-3">
      {entries.map((entry, i) => (
        <li key={i} className="relative flex gap-2">
          <span
            aria-hidden
            className="bg-border absolute top-[7px] -left-[16.5px] h-[7px] w-[7px] rounded-full"
          />
          <time
            dateTime={`PT${Math.round(entry.atMs / 1000)}S`}
            className="text-faint w-9 shrink-0 pt-px text-[11px] tabular-nums"
          >
            {formatRunClock(entry.atMs)}
          </time>
          <div className="min-w-0 flex-1">
            {entry.kind === "step" && (
              <p className="text-ink-2 text-[12.5px] font-semibold">
                {stepLabel(entry.step)}
              </p>
            )}
            {entry.kind === "narration" && (
              <p className="text-muted-foreground text-[12.5px] leading-relaxed whitespace-pre-wrap italic">
                {entry.text.trim()}
              </p>
            )}
            {entry.kind === "check" && <AgentRunCheckItem check={entry} />}
          </div>
        </li>
      ))}
    </ol>
  );
}
