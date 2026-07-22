/**
 * Operator-facing emails for the publication pipeline, sent to the
 * SYSTEM_NOTIFICATION_EMAIL inbox (never to parents). Deliberately English-only
 * — a conscious deviation from the localized copy in `strings.ts`: the
 * recipient is the dodi operator, not an account with a language preference.
 *
 * Publication rows are plaintext by design (voluntary disclosure at submit
 * time), so naming the game title here does not breach server blindness.
 */
import { Heading, Section, Text } from "@react-email/components";

import type { PublicationRejectionReason, RejectionKind } from "@dodi/protocol";

import { EmailShell } from "./layout";
import { colors, fontStack } from "./theme";

const OPERATOR_FOOTER = {
  reason:
    "You are receiving this because SYSTEM_NOTIFICATION_EMAIL on the dodi platform points at this inbox.",
} as const;

const headingStyle = {
  margin: "0 0 14px",
  fontFamily: fontStack,
  fontSize: 20,
  lineHeight: "26px",
  fontWeight: 700,
  color: colors.text,
} as const;

const bodyStyle = {
  margin: "0 0 4px",
  fontFamily: fontStack,
  fontSize: 15,
  lineHeight: "23px",
  color: colors.text,
} as const;

const metaStyle = {
  margin: "14px 0 0",
  fontFamily: fontStack,
  fontSize: 13,
  lineHeight: "20px",
  color: colors.muted,
} as const;

export interface PublicationSubmittedEmailProps {
  appUrl: string;
  publicationId: string;
  title: string;
  handle: string | null;
}

/** "A publication request was created" — fired on every submit/resubmit. */
export function PublicationSubmittedEmail({
  appUrl,
  publicationId,
  title,
  handle,
}: PublicationSubmittedEmailProps) {
  return (
    <EmailShell
      preview={`New publication request: ${title}`}
      appUrl={appUrl}
      locale="en"
      footer={OPERATOR_FOOTER}
    >
      <Heading as="h1" style={headingStyle}>
        New publication request
      </Heading>
      <Text style={bodyStyle}>
        “{title}” by @{handle ?? "unknown"} was submitted to dodi Discover and
        is waiting in the review queue. The security agent will process it on
        the next run.
      </Text>
      <Text style={metaStyle}>Publication id: {publicationId}</Text>
    </EmailShell>
  );
}

export interface PublicationRejectedEmailProps {
  appUrl: string;
  publicationId: string;
  title: string;
  handle: string | null;
  kind: RejectionKind;
  reasons: PublicationRejectionReason[];
}

/** "The security agent rejected a submission" — hard or soft. */
export function PublicationRejectedEmail({
  appUrl,
  publicationId,
  title,
  handle,
  kind,
  reasons,
}: PublicationRejectedEmailProps) {
  return (
    <EmailShell
      preview={`Publication ${kind}-rejected: ${title}`}
      appUrl={appUrl}
      locale="en"
      footer={OPERATOR_FOOTER}
    >
      <Heading as="h1" style={headingStyle}>
        Publication {kind}-rejected
      </Heading>
      <Text style={bodyStyle}>
        The security agent rejected “{title}” by @{handle ?? "unknown"}
        {kind === "hard"
          ? ". The rejection is permanent: the source game is blocked from resubmission and the account has been flagged for review."
          : ". The parent has been shown the reasons and may fix the game and resubmit."}
      </Text>
      <Section style={{ margin: "16px 0 0" }}>
        {reasons.map((reason, i) => (
          <Text
            key={`${reason.code}-${i}`}
            style={{
              margin: "0 0 10px",
              fontFamily: fontStack,
              fontSize: 13,
              lineHeight: "20px",
              color: colors.text,
            }}
          >
            <strong>{reason.code}</strong>
            {reason.note ? <> — {reason.note}</> : null}
          </Text>
        ))}
      </Section>
      <Text style={metaStyle}>Publication id: {publicationId}</Text>
    </EmailShell>
  );
}
