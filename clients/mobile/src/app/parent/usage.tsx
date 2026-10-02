import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { type UsageResponse, loadUsage, minutesOf, prettyModel, usageSummary } from "@dodi/client-state/usage";
import { sectionMessage, usageStats } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { StatCell, StatStrip } from "@/components/parent/stat-strip";
import { ShellContent } from "@/components/shared/shell-content";
import { Text } from "@/components/ui";
import { useKids } from "@/lib/use-kids";

/**
 * This month's AI usage (web: parent/usage/page): voice minutes and games
 * made, then per model and per child.
 */
export default function UsageScreen() {
  const t = useTranslations("usage");
  const { kids } = useKids();
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let isAlive = true;
    // Non-critical: on failure the page just shows the empty state.
    void loadUsage(api).then((json) => {
      if (isAlive && json) setData(json);
    });
    return () => {
      isAlive = false;
    };
  }, []);

  const kidName = (id: string | null): string =>
    (id && kids?.find((k) => k.id === id)?.display_name) || t("unknownChild");
  const { gamesMade, voiceMinutes, hasUsage } = usageSummary(data);

  return (
    <ShellContent>
      <StatStrip className={usageStats}>
        <StatCell num={voiceMinutes} label={t("voiceMinutes")} />
        <StatCell num={gamesMade} label={t("gamesMade")} />
      </StatStrip>

      {!hasUsage || !data ? (
        <Section>
          <View className={sectionMessage.box}>
            <Text className={sectionMessage.text}>{t("noUsage")}</Text>
          </View>
        </Section>
      ) : (
        <>
          <Section title={t("perModel")}>
            {data.perModel.map((m) => (
              <Row key={`${m.provider}:${m.model}`}>
                <RowMain>
                  <RowTitle>{prettyModel(m.model)}</RowTitle>
                  <RowMeta>
                    {t("createsEdits", { creates: m.creates, edits: m.edits, plans: m.plans, analyses: m.analyses })}
                  </RowMeta>
                </RowMain>
              </Row>
            ))}
          </Section>

          <Section title={t("perChild")}>
            {data.perKid.map((k, i) => (
              <Row key={k.kidId ?? `account-${i}`}>
                <RowMain>
                  <RowTitle>{kidName(k.kidId)}</RowTitle>
                  <RowMeta>
                    {t("childGames", { count: k.games })}
                    {" · "}
                    {t("childVoice", { count: minutesOf(k.voiceSeconds) })}
                  </RowMeta>
                </RowMain>
              </Row>
            ))}
          </Section>
        </>
      )}
    </ShellContent>
  );
}
