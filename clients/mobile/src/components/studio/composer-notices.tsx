import type { ReactNode } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import type { BuildNotice } from "@dodi/studio/build-runner";
import { composerNotice as styles } from "@dodi/ui-recipes";

import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { OpenSettingsLink } from "./settings-fields";
import { isBackgroundBuildAvailable } from "../../../modules/background-build";

function Notice({ tone, children }: { tone: "warning" | "primary"; children: ReactNode }) {
  const isWarning = tone === "warning";
  const textClass = cn(styles.text, isWarning ? styles.warningText : styles.primaryText, "flex-1");
  return (
    <View accessibilityRole="alert" className={cn(styles.box, isWarning ? styles.warning : styles.primary)}>
      <View className="mt-px">
        <Icon name="alert" size={14} color={isWarning ? "warning" : "primary"} />
      </View>
      {typeof children === "string" ? <Text className={textClass}>{children}</Text> : children}
    </View>
  );
}

interface ComposerNoticesProps {
  needsGameProvider: boolean;
  isThinking: boolean;
  /** A build (not a plan turn) is running on this device for this game. */
  isBuildRunning: boolean;
  /** An interrupted build can continue from its checkpoint. */
  canResume: boolean;
  isOtherBuildRunning: boolean;
  onResume: () => void;
  onDiscardResumable: () => void;
  error: string | null;
  bgNotice: BuildNotice;
  previewNotice: BuildNotice;
  hasVisualCheckNotice: boolean;
}

/** The lines above the composer: warnings, the running hint, resume, errors. */
export function ComposerNotices({
  needsGameProvider,
  isThinking,
  isBuildRunning,
  canResume,
  isOtherBuildRunning,
  onResume,
  onDiscardResumable,
  error,
  bgNotice,
  previewNotice,
  hasVisualCheckNotice,
}: ComposerNoticesProps) {
  const t = useTranslations("gameStudio");
  const warningText = cn(styles.text, styles.warningText);
  // The web's hints speak of a browser tab. Where the OS keeps builds running
  // (the background-build module), a build says so and a plan turn needs no
  // warning; without it (e.g. Expo Go) the web's texts still apply.
  const hasBackgroundBuild = isBackgroundBuildAvailable();
  const runningNoticeKey = isBuildRunning
    ? hasBackgroundBuild
      ? "buildRunningHintApp"
      : "buildRunningHint"
    : hasBackgroundBuild
      ? null
      : "agentRunningWarning";
  return (
    <>
      {needsGameProvider ? (
        <Notice tone="warning">
          <Text className={cn(warningText, "flex-1")}>
            {`${t("needThinkingProvider")} `}
            <OpenSettingsLink className={cn(warningText, styles.link)} />
          </Text>
        </Notice>
      ) : null}
      {isThinking && runningNoticeKey ? <Notice tone="primary">{t(runningNoticeKey)}</Notice> : null}
      {canResume && !isThinking ? (
        <View className={styles.resume}>
          <Text className={cn(styles.resumeText, styles.resumeLabel)}>{t("resumeBuildNotice")}</Text>
          <Button size="sm" onPress={onResume} disabled={isOtherBuildRunning}>
            {t("resumeBuild")}
          </Button>
          <Button size="sm" variant="ghost" onPress={onDiscardResumable}>
            {t("discardResumableBuild")}
          </Button>
        </View>
      ) : null}
      {error ? (
        <View accessibilityRole="alert" className={styles.error}>
          <Text className={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {bgNotice ? (
        <Notice tone="warning">{t(bgNotice === "failed" ? "bgFailedNotice" : "bgSkippedNotice")}</Notice>
      ) : null}
      {previewNotice ? (
        <Notice tone="warning">
          {t(previewNotice === "failed" ? "previewFailedNotice" : "previewSkippedNotice")}
        </Notice>
      ) : null}
      {hasVisualCheckNotice ? <Notice tone="warning">{t("visualCheckFailedNotice")}</Notice> : null}
    </>
  );
}
