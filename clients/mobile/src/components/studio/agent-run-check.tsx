import { View } from "react-native";
import { useTranslations } from "use-intl";
import type { AgentRunCheck } from "@dodi/studio/agent-run-log";
import { agentRunCheck as styles } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { AgentRunFrames } from "./agent-run-frames";

interface IssueListProps {
  title: string;
  items: string[];
  tone: "danger" | "warning" | "muted";
}

const TONE = {
  danger: styles.issuesDanger,
  warning: styles.issuesWarning,
  muted: styles.issuesMuted,
} as const;

function IssueList({ title, items, tone }: IssueListProps) {
  if (items.length === 0) return null;
  return (
    <View className={styles.issues}>
      <Text className={cn(styles.issuesTitle, TONE[tone])}>{title}</Text>
      <View className={styles.issueList}>
        {items.map((item, i) => (
          <Text key={i} className={styles.issueText}>
            {`• ${item}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** One screenshot check on the run timeline: frames, then what it found. */
export function AgentRunCheckItem({ check }: { check: AgentRunCheck }) {
  const t = useTranslations("gameStudio");
  const hasProblems = check.hasFailed || !check.isReady || check.errors.length > 0;

  return (
    <View>
      <View className={styles.title}>
        <Icon name="camera" size={14} color="primary" />
        <Text className={styles.titleText}>{t("runLogCheckTitle")}</Text>
        {!check.hasFailed ? (
          <Text className={cn(styles.status, hasProblems ? styles.statusBad : styles.statusGood)}>
            {check.isReady ? t("runLogCheckReady") : t("runLogCheckNotReady")}
          </Text>
        ) : null}
      </View>
      {check.requestedSteps.length > 0 ? (
        <Text className={styles.requested}>
          {t("runLogCheckRequested", { steps: check.requestedSteps.join(", ") })}
        </Text>
      ) : null}
      {check.hasFailed ? (
        <Text className={styles.failed}>{t("runLogCheckFailed")}</Text>
      ) : check.frames.length > 0 ? (
        <AgentRunFrames frames={check.frames} />
      ) : (
        <Text className={styles.noFrames}>
          {check.hasDroppedFrames ? t("runLogFramesDropped") : t("runLogNoFrames")}
        </Text>
      )}
      {check.frames.length > 0 && check.hasDroppedFrames ? (
        <Text className={styles.noFrames}>{t("runLogFramesPartlyDropped")}</Text>
      ) : null}
      <IssueList title={t("runLogErrors")} items={check.errors} tone="danger" />
      <IssueList title={t("runLogLayoutIssues")} items={check.layoutIssues} tone="warning" />
      <IssueList title={t("runLogWarnings")} items={check.warnings} tone="muted" />
    </View>
  );
}
