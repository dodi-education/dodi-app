"use client";

import { useTranslations } from "next-intl";

import { CopyButton } from "@/components/parent/access/copy-button";
import { Section } from "@/components/parent/section";
import { AGENT_STARTER_PROMPT } from "@dodi/client-state/authorized-clients";

/** "Get started": the prompt a parent pastes into their AI assistant. */
export function AgentStarter() {
  const t = useTranslations("access");
  return (
    <Section title={t("startTitle")} desc={t("startDesc")}>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
        <p className="flex-1 rounded-md bg-muted px-3 py-2.5 font-mono text-[13px] leading-relaxed break-words">
          {AGENT_STARTER_PROMPT}
        </p>
        <CopyButton text={AGENT_STARTER_PROMPT} />
      </div>
    </Section>
  );
}
