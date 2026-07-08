"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { StatCell, StatStrip } from "@/components/parent/stat-strip";
import { useKids } from "@/hooks/use-kids";
import { dodi } from "@/lib/api";

interface ModelLine {
  provider: string;
  model: string;
  creates: number;
  edits: number;
  analyses: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}
interface KidLine {
  kidId: string | null;
  games: number;
  voiceSeconds: number;
}
interface UsageResponse {
  perModel: ModelLine[];
  perKid: KidLine[];
  gamesByModel: Record<string, number>;
  voiceSeconds: number;
}

/** "claude-opus-4-8" → "Claude opus-4-8"; strips dated snapshot suffixes. */
function prettyModel(model: string): string {
  const base = model.replace(/-\d{8}$/, "");
  if (base.startsWith("claude-")) return `Claude ${base.slice(7)}`;
  if (base.startsWith("gemini-")) return `Gemini ${base.slice(7)}`;
  if (base.startsWith("mistral-")) return `Mistral ${base.slice(8)}`;
  return base;
}

export default function UsagePage() {
  const t = useTranslations("usage");
  const { kids } = useKids();
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await dodi.request("/api/usage");
        if (!res.ok) return;
        const json = (await res.json()) as UsageResponse;
        if (alive) setData(json);
      } catch {
        /* non-critical — the page just shows the empty state */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const kidName = (id: string | null): string =>
    (id && kids?.find((k) => k.id === id)?.display_name) || t("unknownChild");

  const gamesMade = (data?.perModel ?? []).reduce(
    (s, m) => s + m.creates + m.edits,
    0,
  );
  const voiceMinutes = Math.round((data?.voiceSeconds ?? 0) / 60);
  const hasUsage = !!data && (data.perModel.length > 0 || data.voiceSeconds > 0);

  return (
    <div>
      <StatStrip className="mb-8 overflow-hidden rounded-lg border bg-card shadow-card">
        <StatCell num={voiceMinutes} label={t("voiceMinutes")} />
        <StatCell num={gamesMade} label={t("gamesMade")} />
      </StatStrip>

      {!hasUsage ? (
        <Section>
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
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
                    {t("childVoice", { count: Math.round(k.voiceSeconds / 60) })}
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
