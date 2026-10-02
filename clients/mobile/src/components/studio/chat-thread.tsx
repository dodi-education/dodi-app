import type { ReactNode } from "react";
import { useRef } from "react";
import { Image, ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";
import type { AgentRunLog } from "@dodi/studio/agent-run-log";
import type { StudioChatMessage } from "@dodi/studio/transcript";
import type { AgentStep } from "@dodi/types/agent-progress";
import { chatMessage, chatThinking, chatThread, chatWelcome } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { AgentRunTimeline } from "./agent-run-timeline";
import { ChatMessageItem } from "./chat-message";
import { DODI_FULL, DODI_HEAD } from "./dodi-images";
import { ActionRow } from "./plan-chat-actions";
import { ThinkingDots } from "./thinking-dots";

interface ChatThreadProps {
  /** A Plan surface covers it: hidden, not unmounted, so it keeps its place. */
  isHidden: boolean;
  messages: StudioChatMessage[];
  isPlanMode: boolean;
  /** The phone's Plan step: no big dodi, the height goes to the actions. */
  isMobilePlan: boolean;
  needsGameProvider: boolean;
  isThinking: boolean;
  step: AgentStep | null;
  narration: string;
  writeChars: number;
  liveRun: AgentRunLog | null;
  /** The Plan step's empty-state actions (PlanEmptyActions). */
  planActions: ReactNode;
  onStarter: (text: string) => void;
  /** Index of the reply that carries the turn links, or -1. */
  linksIndex: number;
  onShowChanges: () => void;
  onRevert: () => void;
  isReverted: boolean;
  isRevertDisabled: boolean;
}

/** The conversation (web: the studio's thread): welcome or turns, then dodi at work. */
export function ChatThread({
  isHidden,
  messages,
  isPlanMode,
  isMobilePlan,
  needsGameProvider,
  isThinking,
  step,
  narration,
  writeChars,
  liveRun,
  planActions,
  onStarter,
  linksIndex,
  onShowChanges,
  onRevert,
  isReverted,
  isRevertDisabled,
}: ChatThreadProps) {
  const t = useTranslations("gameStudio");
  const scrollRef = useRef<ScrollView>(null);
  const starters = [t("starterCounting"), t("starterMath"), t("starterStory"), t("starterDrawing")];

  return (
    <ScrollView
      ref={scrollRef}
      className={cn(chatThread.box, isHidden && "hidden")}
      contentContainerClassName={chatThread.inner}
      keyboardShouldPersistTaps="handled"
      // Pin the thread to the latest turn as it grows (resume, each turn, streaming).
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
    >
      {messages.length === 0 ? (
        <View className={cn(chatWelcome.box, isMobilePlan ? chatWelcome.plan : chatWelcome.idle)}>
          {!isMobilePlan ? <Image source={DODI_FULL} className={chatWelcome.image} resizeMode="contain" /> : null}
          <Text accessibilityRole="header" className={cn(chatWelcome.text, chatWelcome.title)}>
            {t(isPlanMode ? "planWelcomeTitle" : "welcomeTitle")}
          </Text>
          <Text className={cn(chatWelcome.text, chatWelcome.description)}>
            {t(isPlanMode ? "planWelcomeDesc" : "welcomeDesc")}
          </Text>
          {isPlanMode ? (
            planActions
          ) : !needsGameProvider ? (
            <View className={chatWelcome.list}>
              {starters.map((s) => (
                <ActionRow key={s} icon="sparkles" label={s} onPress={() => onStarter(s)} />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        messages.map((m, i) => (
          <ChatMessageItem
            key={i}
            message={m}
            links={i === linksIndex ? { onShowChanges, onRevert, isReverted, isRevertDisabled } : undefined}
          />
        ))
      )}
      {isThinking ? (
        <View className={chatMessage.row}>
          <Image source={DODI_HEAD} className={chatMessage.avatar} resizeMode="contain" />
          <View className={chatMessage.body}>
            <ThinkingDots />
            {liveRun ? <AgentRunTimeline run={liveRun} isLive /> : null}
            {/* Not a live region: the header status line carries progress. */}
            {narration.trim() ? <Text className={chatThinking.narration}>{narration.trim()}</Text> : null}
            {step === "writing_code" && writeChars > 0 ? (
              <Text className={chatThinking.writeProgress}>{t("writeProgress", { chars: writeChars })}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
