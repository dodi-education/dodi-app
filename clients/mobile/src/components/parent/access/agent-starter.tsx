import { View } from "react-native";
import { useTranslations } from "use-intl";
import { AGENT_STARTER_PROMPT } from "@dodi/client-state/authorized-clients";

import { Section } from "@/components/parent/section";
import { Text } from "@/components/ui";

import { CopyButton } from "./copy-button";

/** "Get started" (web: access/agent-starter): the prompt a parent pastes into their AI assistant. */
export function AgentStarter() {
  const t = useTranslations("access");
  return (
    <Section title={t("startTitle")} desc={t("startDesc")}>
      <View className="flex-col gap-3 px-5 py-4">
        <Text selectable className="rounded-md bg-muted px-3 py-2.5 font-mono text-[13px] leading-relaxed">
          {AGENT_STARTER_PROMPT}
        </Text>
        <CopyButton text={AGENT_STARTER_PROMPT} />
      </View>
    </Section>
  );
}
