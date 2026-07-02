/**
 * Email sent to a parent when one of their children has a friend request
 * waiting on that parent's final approval. Deliberately privacy-preserving: the
 * platform is server-blind (child/friend names are E2EE-sealed), so this email
 * names no one and carries no sealed data — it just drives the parent into the
 * app, where the client decrypts and shows who the request is from.
 */
import { Button, Heading, Section, Text } from "@react-email/components";

import { EmailShell } from "./layout";
import { type EmailLocale, friendApprovalCopy } from "./strings";
import { colors, fontStack } from "./theme";

export interface FriendApprovalEmailProps {
  /** Web app origin (NEXT_PUBLIC_APP_URL). The CTA deep-links into the app. */
  appUrl: string;
  locale: EmailLocale;
}

export function FriendApprovalEmail({ appUrl, locale }: FriendApprovalEmailProps) {
  const c = friendApprovalCopy(locale);
  const reviewUrl = `${appUrl.replace(/\/+$/, "")}/parent/dashboard`;

  return (
    <EmailShell preview={c.preview} appUrl={appUrl} locale={locale}>
      <Heading
        as="h1"
        style={{
          margin: "0 0 14px",
          fontFamily: fontStack,
          fontSize: 20,
          lineHeight: "26px",
          fontWeight: 700,
          color: colors.text,
        }}
      >
        {c.heading}
      </Heading>
      <Text
        style={{
          margin: "0 0 4px",
          fontFamily: fontStack,
          fontSize: 15,
          lineHeight: "23px",
          color: colors.text,
        }}
      >
        {c.body}
      </Text>

      <Section style={{ margin: "22px 0 6px" }}>
        <Button
          href={reviewUrl}
          style={{
            backgroundColor: colors.primary,
            color: "#FFFFFF",
            fontFamily: fontStack,
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 10,
            padding: "12px 22px",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          {c.button}
        </Button>
      </Section>

      <Text
        style={{
          margin: "20px 0 0",
          paddingTop: 16,
          borderTop: `1px solid ${colors.border}`,
          fontFamily: fontStack,
          fontSize: 13,
          lineHeight: "20px",
          color: colors.muted,
        }}
      >
        {c.privacyNote}
      </Text>
    </EmailShell>
  );
}

export default FriendApprovalEmail;
