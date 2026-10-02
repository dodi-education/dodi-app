"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { StatCell, StatStrip } from "@/components/parent/stat-strip";
import { useKids } from "@/hooks/use-kids";
import { dodi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sectionMessage, usageStats } from "@dodi/ui-recipes";
import {
  loadUsage,
  minutesOf,
  prettyModel,
  usageSummary,
  type UsageResponse,
} from "@dodi/client-state/usage";

export default function UsagePage() {
  const t = useTranslations("usage");
  const { kids } = useKids();
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let alive = true;
    // Non-critical: on failure the page just shows the empty state.
    void loadUsage(dodi).then((json) => {
      if (alive && json) setData(json);
    });
    return () => {
      alive = false;
    };
  }, []);

  const kidName = (id: string | null): string =>
    (id && kids?.find((k) => k.id === id)?.display_name) || t("unknownChild");

  const { gamesMade, voiceMinutes, hasUsage } = usageSummary(data);

  return (
    <div>
      <StatStrip className={usageStats}>
        <StatCell num={voiceMinutes} label={t("voiceMinutes")} />
        <StatCell num={gamesMade} label={t("gamesMade")} />
      </StatStrip>

      {!hasUsage || !data ? (
        <Section>
          <div className={cn(sectionMessage.box, sectionMessage.text)}>
            {t("noUsage")}
          </div>
        </Section>
      ) : (
        <>
          <Section title={t("perModel")}>
            {data.perModel.map((m) => (
              <Row key={`${m.provider}:${m.model}`}>
                <RowMain>
                  <RowTitle>{prettyModel(m.model)}</RowTitle>
                  <RowMeta>
                    {t("createsEdits", {
                      creates: m.creates,
                      edits: m.edits,
                      plans: m.plans,
                      analyses: m.analyses,
                    })}
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
    </div>
  );
}
