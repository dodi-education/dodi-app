import { View } from "react-native";
import { type AgentRunEntry, type AgentRunLog, formatRunClock } from "@dodi/studio/agent-run-log";
import { agentRun } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { AgentRunCheckItem } from "./agent-run-check";
import { useStepLabel } from "./step-labels";

interface AgentRunTimelineProps {
  run: AgentRunLog;
  /**
   * The build is still running: its newest narration block is already shown
   * by the studio's live narration line, so the timeline leaves it out.
   */
  isLive?: boolean;
}

/** What the game agent did in one build, in order, with offsets from its start. */
export function AgentRunTimeline({ run, isLive = false }: AgentRunTimelineProps) {
  const stepLabel = useStepLabel("runLog");
  const last = run.entries[run.entries.length - 1];
  const entries: AgentRunEntry[] = run.entries.filter(
    (e) => !(e.kind === "narration" && (!e.text.trim() || (isLive && e === last))),
  );
  if (entries.length === 0) return null;

  return (
    <View className={cn(agentRun.list, agentRun.listGap)}>
      {entries.map((entry, i) => (
        <View key={i} className={agentRun.item}>
          <View className={agentRun.dot} />
          <Text className={agentRun.time}>{formatRunClock(entry.atMs)}</Text>
          <View className={agentRun.content}>
            {entry.kind === "step" ? <Text className={agentRun.step}>{stepLabel(entry.step)}</Text> : null}
            {entry.kind === "narration" ? (
              <Text className={agentRun.narration}>{entry.text.trim()}</Text>
            ) : null}
            {entry.kind === "check" ? <AgentRunCheckItem check={entry} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
