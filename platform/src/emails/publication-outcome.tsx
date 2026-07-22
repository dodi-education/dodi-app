/**
 * Email sent to the PUBLISHER (the parent who submitted a game) once the dodi
 * Discover review has decided the outcome. Unlike the operator emails in
 * `publication-review.tsx`, this one is parent-facing and localized to the
 * account's language.
 *
 * Three shapes, one template:
 *  - approved  — the game is live on Discover; CTA into the catalog.
 *  - soft      — changes requested: the reasons are listed and the parent is
 *                told they can fix the game and resubmit; CTA into the studio.
 *  - hard      — permanent rejection: deliberately DETAIL-FREE (no reasons), a
 *                requirement of the review policy. The notifier also passes an
 *                empty reason list, so specifics can't leak even by mistake.
 *
 * Naming the game title here does not breach server blindness: a publication
 * row is plaintext by design (the parent voluntarily disclosed it at submit
 * time), which is also why the review pass may read it at all.
 */
import { Button, Heading, Section, Text } from "@react-email/components";

import type { PublicationRejectionReason } from "@dodi/protocol";

import { EmailShell } from "./layout";
import { type EmailLocale, publicationOutcomeCopy } from "./strings";
import { colors, fontStack } from "./theme";

/** The publisher-facing verdict: an approval or one of the two rejection kinds. */
export type PublicationOutcome = "approved" | "soft" | "hard";

export interface PublicationOutcomeEmailProps {
  /** Web app origin (NEXT_PUBLIC_APP_URL). The CTA deep-links into the app. */
  appUrl: string;
  locale: EmailLocale;
  /** Plaintext publication title — safe to show (see file header). */
  title: string;
  outcome: PublicationOutcome;
  /**
   * The parent's own editable game, target of the "fix it" CTA on a soft
   * rejection. Null falls the CTA back to the games list.
   */
  sourceGameId: string | null;
  /** Only rendered for a soft rejection; empty for approved/hard. */
  reasons: PublicationRejectionReason[];
}

const headingStyle = {
  margin: "0 0 6px",
  fontFamily: fontStack,
  fontSize: 20,
  lineHeight: "26px",
  fontWeight: 700,
  color: colors.text,
} as const;

const titleStyle = {
  margin: "0 0 14px",
  fontFamily: fontStack,
  fontSize: 15,
  lineHeight: "22px",
  fontWeight: 600,
  color: colors.muted,
} as const;

const bodyStyle = {
  margin: "0 0 4px",
  fontFamily: fontStack,
  fontSize: 15,
  lineHeight: "23px",
  color: colors.text,
} as const;

const buttonStyle = {
  backgroundColor: colors.primary,
  color: "#FFFFFF",
  fontFamily: fontStack,
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 10,
  padding: "12px 22px",
  textDecoration: "none",
  display: "inline-block",
} as const;

export function PublicationOutcomeEmail({
  appUrl,
  locale,
  title,
  outcome,
  sourceGameId,
  reasons,
}: PublicationOutcomeEmailProps) {
  const c = publicationOutcomeCopy(locale);
  const origin = appUrl.replace(/\/+$/, "");

  const preview =
    outcome === "approved"
      ? c.approvedPreview
      : outcome === "soft"
        ? c.softPreview
        : c.hardPreview;
  const heading =
    outcome === "approved"
      ? c.approvedHeading
      : outcome === "soft"
        ? c.softHeading
        : c.hardHeading;
  const body =
    outcome === "approved"
      ? c.approvedBody
      : outcome === "soft"
        ? c.softBody
        : c.hardBody;

  return (
    <EmailShell preview={preview} appUrl={appUrl} locale={locale}>
      <Heading as="h1" style={headingStyle}>
        {heading}
      </Heading>
      <Text style={titleStyle}>“{title}”</Text>
      <Text style={bodyStyle}>{body}</Text>

      {/* Reasons + resubmit hint: soft rejections only. Hard shares nothing. */}
      {outcome === "soft" && reasons.length > 0 && (
        <Section style={{ margin: "14px 0 0" }}>
          {reasons.map((reason, i) => (
            <Section
              key={`${reason.code}-${i}`}
              style={{
                margin: "0 0 8px",
                padding: "10px 14px",
                backgroundColor: colors.bg,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  margin: 0,
                  fontFamily: fontStack,
                  fontSize: 14,
                  lineHeight: "20px",
                  fontWeight: 700,
                  color: colors.text,
                }}
              >
                {c.reasonLabels[reason.code]}
              </Text>
              {reason.note ? (
                <Text
                  style={{
                    margin: "3px 0 0",
                    fontFamily: fontStack,
                    fontSize: 13,
                    lineHeight: "20px",
                    color: colors.muted,
                  }}
                >
                  {reason.note}
                </Text>
              ) : null}
            </Section>
          ))}
        </Section>
      )}

      {outcome === "soft" && (
        <Text style={{ ...bodyStyle, margin: "12px 0 0" }}>{c.softRetry}</Text>
      )}

      {outcome !== "hard" && (
        <Section style={{ margin: "22px 0 6px" }}>
          <Button
            href={
              outcome === "approved"
                ? `${origin}/parent/games`
                : `${origin}/parent/games/${sourceGameId ?? ""}`
            }
            style={buttonStyle}
          >
            {outcome === "approved" ? c.approvedButton : c.softButton}
          </Button>
        </Section>
      )}
    </EmailShell>
  );
}

export default PublicationOutcomeEmail;
