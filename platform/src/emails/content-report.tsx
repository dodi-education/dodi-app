/**
 * Operator-facing email for an in-app content report, sent to the
 * SYSTEM_NOTIFICATION_EMAIL inbox (never to parents). English-only like the
 * publication emails: the recipient is the dodi operator.
 *
 * Everything here is what the parent chose to send: the kind, reason and their
 * own description. A game title appears only for plaintext games (system or
 * Discover); a private game is named by id alone.
 */
import { Heading, Text } from "@react-email/components";

import type { ContentReportKind, ContentReportReason } from "@dodi/types/database";

import { EmailShell } from "./layout";
import { colors, fontStack } from "./theme";

const OPERATOR_FOOTER = {
  reason:
    "You are receiving this because SYSTEM_NOTIFICATION_EMAIL on the dodi platform points at this inbox.",
} as const;

const KIND_LABEL: Record<ContentReportKind, string> = {
  companion_answer: "Something the companion said",
  game: "A game in the family's library",
  discover_game: "A game on Discover",
};

const REASON_LABEL: Record<ContentReportReason, string> = {
  inappropriate: "Inappropriate for kids",
  upsetting: "Scary or upsetting",
  wrong: "Wrong or misleading",
  other: "Something else",
};

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

const quoteStyle = {
  ...bodyStyle,
  margin: "12px 0 0",
  padding: "10px 14px",
  borderLeft: `3px solid ${colors.muted}`,
  whiteSpace: "pre-wrap",
} as const;

const metaStyle = {
  margin: "14px 0 0",
  fontFamily: fontStack,
  fontSize: 13,
  lineHeight: "20px",
  color: colors.muted,
} as const;

export interface ContentReportEmailProps {
  appUrl: string;
  reportId: string;
  contentKind: ContentReportKind;
  reason: ContentReportReason;
  details: string | null;
  gameId: string | null;
  /** Public title for system and Discover games; null for private games. */
  gameTitle: string | null;
  clientPlatform: "web" | "mobile";
}

export function ContentReportEmail({
  appUrl,
  reportId,
  contentKind,
  reason,
  details,
  gameId,
  gameTitle,
  clientPlatform,
}: ContentReportEmailProps) {
  return (
    <EmailShell
      preview={`New report: ${KIND_LABEL[contentKind]}`}
      appUrl={appUrl}
      locale="en"
      footer={OPERATOR_FOOTER}
    >
      <Heading as="h1" style={headingStyle}>
        New content report
      </Heading>
      <Text style={bodyStyle}>
        {KIND_LABEL[contentKind]}: {REASON_LABEL[reason]}.
      </Text>
      {gameId ? (
        <Text style={bodyStyle}>
          Game: {gameTitle ? `“${gameTitle}” ` : ""}({gameId})
        </Text>
      ) : null}
      {details ? <Text style={quoteStyle}>{details}</Text> : null}
      <Text style={metaStyle}>
        Report id: {reportId} · sent from {clientPlatform}
      </Text>
    </EmailShell>
  );
}
