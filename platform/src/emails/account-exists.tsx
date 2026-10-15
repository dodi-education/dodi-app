/**
 * "You already have an account" notice: what the owner of a registered address
 * receives when someone signs up (or asks for a confirm code) with it. The
 * sign-up page answers the same for new and registered addresses, so this
 * email is where the owner learns what happened. It carries no code: the way
 * in is the normal sign-in, or the password reset.
 */
import { Button, Heading, Link, Section, Text } from "@react-email/components";

import { EmailShell } from "./layout";
import { accountExistsCopy, authCodeCopy, type EmailLocale } from "./strings";
import { colors, fontStack } from "./theme";

export interface AccountExistsEmailProps {
  locale: EmailLocale;
  /** Web app origin (NEXT_PUBLIC_APP_URL): the sign-in and reset links. */
  appUrl: string;
}

export function AccountExistsEmail({ locale, appUrl }: AccountExistsEmailProps) {
  const c = accountExistsCopy(locale);
  const origin = appUrl.replace(/\/+$/, "");

  return (
    <EmailShell
      preview={c.preview}
      appUrl={appUrl}
      locale={locale}
      footer={{ reason: authCodeCopy(locale).footerReason }}
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

      <Section style={{ margin: "22px 0 6px" }}>
        <Button
          href={`${origin}/login`}
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
          {c.signInButton}
        </Button>
      </Section>

      <Text
        style={{
          margin: "16px 0 0",
          fontFamily: fontStack,
          fontSize: 15,
          lineHeight: "23px",
          color: colors.text,
        }}
      >
        {c.forgotPassword}{" "}
        <Link href={`${origin}/reset-password`} style={{ color: colors.primary }}>
          {c.resetLink}
        </Link>
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
        {c.ignore}
      </Text>
    </EmailShell>
  );
}

export default AccountExistsEmail;
