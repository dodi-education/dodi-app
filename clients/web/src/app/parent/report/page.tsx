"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";

import { sectionFormError, sectionMessage, textarea } from "@dodi/ui-recipes";
import {
  type ContentReportDraft,
  REPORT_CONTENT_KINDS,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  reportDraftFromQuery,
  submitContentReport,
} from "@dodi/client-state/content-report";

import { FieldRow, fieldSelectClass, StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { useKids } from "@/hooks/use-kids";
import { dodi } from "@/lib/api";
import { cn } from "@/lib/utils";

/** The kid select's "not about a specific kid" value. */
const NO_KID = "none";

/**
 * Report a problem: the in-app flagging of AI answers and games that Google
 * Play requires for AI-generated content and the App Store for user-generated
 * content. Entry points pass context in the query (`?kind=discover_game&game=`
 * from a Discover game). The report reaches the operator in plaintext, which
 * the details hint says before anything is sent.
 */
function ReportForm() {
  const t = useTranslations("report");
  const searchParams = useSearchParams();
  const { kids } = useKids();
  const [draft, setDraft] = useState<ContentReportDraft>(() =>
    reportDraftFromQuery({
      kind: searchParams.get("kind"),
      game: searchParams.get("game"),
      kid: searchParams.get("kid"),
    }),
  );
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<ContentReportDraft>) {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSending(true);
    const outcome = await submitContentReport({ api: dodi }, draft, "web");
    setIsSending(false);
    if (outcome.kind === "sent") setIsSent(true);
    else setError(t(outcome.key));
  }

  if (isSent) {
    return (
      <Section>
        <div className={cn(sectionMessage.box, sectionMessage.text)}>{t("sent")}</div>
        <SaveRow>
          <Button
            variant="outline"
            onClick={() => {
              setDraft(reportDraftFromQuery({}));
              setIsSent(false);
            }}
          >
            {t("sendAnother")}
          </Button>
        </SaveRow>
      </Section>
    );
  }

  const isGameReport = draft.contentKind !== "companion_answer";

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-4 text-[13px] text-muted-foreground">{t("description")}</p>

      <Section>
        <FieldRow label={t("kindLabel")} htmlFor="report-kind">
          <select
            id="report-kind"
            value={draft.contentKind}
            onChange={(e) => update({ contentKind: e.target.value as ContentReportDraft["contentKind"] })}
            className={fieldSelectClass}
          >
            {REPORT_CONTENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kinds.${kind}`)}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label={t("kidLabel")} htmlFor="report-kid">
          <select
            id="report-kid"
            value={draft.kidId ?? NO_KID}
            onChange={(e) => update({ kidId: e.target.value === NO_KID ? null : e.target.value })}
            className={fieldSelectClass}
          >
            <option value={NO_KID}>{t("kidNone")}</option>
            {(kids ?? []).map((kid) => (
              <option key={kid.id} value={kid.id}>
                {kid.display_name}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label={t("reasonLabel")} htmlFor="report-reason" required>
          <select
            id="report-reason"
            value={draft.reason}
            onChange={(e) => update({ reason: e.target.value as ContentReportDraft["reason"] })}
            aria-required
            className={fieldSelectClass}
          >
            <option value="" disabled>
              {t("reasonLabel")}
            </option>
            {REPORT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {t(`reasons.${reason}`)}
              </option>
            ))}
          </select>
        </FieldRow>
        {isGameReport && draft.gameId ? (
          <StackField>
            <p className="text-[13px] text-muted-foreground">{t("gameAttached")}</p>
          </StackField>
        ) : null}
      </Section>

      <Section title={t("detailsLabel")} desc={t("detailsHint")}>
        <StackField>
          <textarea
            value={draft.details}
            onChange={(e) => update({ details: e.target.value })}
            maxLength={REPORT_DETAILS_MAX_LENGTH}
            rows={5}
            placeholder={t("detailsPlaceholder")}
            aria-label={t("detailsLabel")}
            className={cn(textarea.box, textarea.text, textarea.web)}
          />
        </StackField>
        {error ? (
          <StackField>
            <p role="alert" className={sectionFormError.text}>
              {error}
            </p>
          </StackField>
        ) : null}
        <SaveRow>
          <Button type="submit" disabled={isSending}>
            {isSending ? t("sending") : t("submit")}
          </Button>
        </SaveRow>
      </Section>
    </form>
  );
}

export default function ReportPage() {
  // useSearchParams needs a Suspense boundary for the build-time prerender.
  return (
    <Suspense fallback={null}>
      <ReportForm />
    </Suspense>
  );
}
