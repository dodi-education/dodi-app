import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type AgentRunLog,
  type AgentRunOutcome,
  formatRunClock,
  runChecks,
} from "@dodi/studio/agent-run-log";
import { agentRun } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { AgentRunTimeline } from "./agent-run-timeline";

const OUTCOME_KEYS: Record<AgentRunOutcome, string> = {
  completed: "runLogOutcomeCompleted",
  validation_failed: "runLogOutcomeValidationFailed",
  stopped: "runLogOutcomeStopped",
  failed: "runLogOutcomeFailed",
};

/**
 * "How dodi built this": a collapsed disclosure under a build's reply with the
 * run's timeline (narration, steps, screenshot checks). The web's <details>.
 */
export function AgentRunHistory({ run }: { run: AgentRunLog }) {
  const t = useTranslations("gameStudio");
  const [isOpen, setIsOpen] = useState(false);
  const checks = runChecks(run).length;
  const duration = formatRunClock(run.durationMs ?? 0);
  const meta = [
    run.outcome ? t(OUTCOME_KEYS[run.outcome], { duration }) : null,
    checks > 0 ? t("runLogChecks", { count: checks }) : null,
  ].filter((part): part is string => part !== null);

  return (
    <View className={agentRun.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((v) => !v)}
        className={agentRun.summary}
      >
        <Icon name="history" size={14} color="faint" />
        <Text className={agentRun.summaryText}>{t("runLogSummary")}</Text>
        {meta.length > 0 ? (
          <Text className={cn(agentRun.summaryText, agentRun.summaryMeta)}>({meta.join(", ")})</Text>
        ) : null}
        <Text
          accessibilityElementsHidden
          className={cn(agentRun.summaryText, agentRun.summaryChevron)}
          style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}
        >
          ›
        </Text>
      </Pressable>
      {isOpen ? (
        run.entries.length > 0 ? (
          <AgentRunTimeline run={run} />
        ) : (
          <Text className={agentRun.empty}>{t("runLogEmpty")}</Text>
        )
      ) : null}
    </View>
  );
}
