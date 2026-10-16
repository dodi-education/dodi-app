/**
 * Operator-facing email for a message from "Give feedback", sent to the
 * SYSTEM_NOTIFICATION_EMAIL inbox (never to parents). English-only like the
 * publication emails: the recipient is the dodi operator.
 *
 * Everything here is what the parent chose to send: their name, the category
 * and their message, plus the account email so the team can answer (the email
 * goes out with Reply-To set to it). A game title appears only for plaintext
 * games (system or Discover); a private game is named by id alone. An
 * attached image travels as a file attachment of the email, named here.
 */
import { Heading, Text } from "@react-email/components";

import type { FeedbackCategory, FeedbackClientPlatform } from "@dodi/types/database";

import { EmailShell } from "./layout";
import { colors, fontStack } from "./theme";

const OPERATOR_FOOTER = {
  reason:
    "You are receiving this because SYSTEM_NOTIFICATION_EMAIL on the dodi platform points at this inbox.",
} as const;

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  feature_request: "Feature request",
  bug_report: "Bug report",
  inappropriate_content: "Inappropriate content",
  other: "Other",
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

export interface FeedbackMessageEmailProps {
  appUrl: string;
  feedbackId: string;
  accountId: string;
  /** NULL when the account row is already gone; the email still goes out. */
  accountEmail: string | null;
  senderName: string;
  category: FeedbackCategory;
  message: string;
  gameId: string | null;
  /** Public title for system and Discover games; null for private games. */
  gameTitle: string | null;
  clientPlatform: FeedbackClientPlatform;
  /** The attached image's file name and size; null when there is none. */
  image: { filename: string; byteSize: number } | null;
}

function kilobytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FeedbackMessageEmail({
  appUrl,
  feedbackId,
  accountId,
  accountEmail,
  senderName,
  category,
  message,
  gameId,
  gameTitle,
  clientPlatform,
  image,
}: FeedbackMessageEmailProps) {
  const label = FEEDBACK_CATEGORY_LABEL[category];
  return (
    <EmailShell
      preview={`${label} from ${senderName}`}
      appUrl={appUrl}
      locale="en"
      footer={OPERATOR_FOOTER}
    >
      <Heading as="h1" style={headingStyle}>
        New feedback: {label}
      </Heading>
      <Text style={bodyStyle}>
        From {senderName}
        {accountEmail ? ` (${accountEmail})` : ""}
      </Text>
      <Text style={bodyStyle}>Account: {accountId}</Text>
      {gameId ? (
        <Text style={bodyStyle}>
          Game: {gameTitle ? `“${gameTitle}” ` : ""}({gameId})
        </Text>
      ) : null}
      <Text style={quoteStyle}>{message}</Text>
      {image ? (
        <Text style={metaStyle}>
          Image attached: {image.filename} ({kilobytes(image.byteSize)})
        </Text>
      ) : null}
      {accountEmail ? (
        <Text style={metaStyle}>Reply to this email to answer {senderName} directly.</Text>
      ) : null}
      <Text style={metaStyle}>
        Feedback id: {feedbackId} · sent from {clientPlatform}
      </Text>
    </EmailShell>
  );
}
