/**
 * One-time code email for sign-up confirmation, password reset and OTP sign-in.
 * Replaces the former hosted-auth templates: the code is entered in-page, so
 * there is no link to click.
 */
import { Heading, Text } from "@react-email/components";

import { EmailShell } from "./layout";
import { authCodeCopy, type EmailLocale } from "./strings";
import { colors, fontStack } from "./theme";

export type AuthCodeKind = "confirm" | "reset" | "sign-in";

export interface AuthCodeEmailProps {
  code: string;
  kind: AuthCodeKind;
  locale: EmailLocale;
  /** Web app origin (NEXT_PUBLIC_APP_URL) for the logo in the shell. */
  appUrl: string;
}

export function AuthCodeEmail({ code, kind, locale, appUrl }: AuthCodeEmailProps) {
  const all = authCodeCopy(locale);
  const c = all[kind];

  return (
    <EmailShell
      preview={c.preview}
      appUrl={appUrl}
      locale={locale}
      footer={{ reason: all.footerReason }}
    >
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
      <Text
        style={{
          margin: "16px 0",
          fontFamily: fontStack,
          fontSize: 28,
          lineHeight: "36px",
          fontWeight: 700,
          letterSpacing: 4,
          color: colors.text,
        }}
      >
        {code}
      </Text>
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
        {c.expiry} {c.ignore}
      </Text>
    </EmailShell>
  );
}

export default AuthCodeEmail;
