/**
 * Sent once when someone subscribes to the dodi newsletter from the marketing
 * site (single opt-in). These are anonymous subscribers with no account, so the
 * shell footer is overridden to drop the account "manage notifications" link.
 */
import { Button, Heading, Section, Text } from "@react-email/components";

import { EmailShell } from "./layout";
import { type EmailLocale, newsletterWelcomeCopy } from "./strings";
import { colors, fontStack } from "./theme";

export interface NewsletterWelcomeEmailProps {
  /** Web app origin (NEXT_PUBLIC_APP_URL). The CTA links to the platform. */
  appUrl: string;
  locale: EmailLocale;
}

export function NewsletterWelcomeEmail({ appUrl, locale }: NewsletterWelcomeEmailProps) {
  const c = newsletterWelcomeCopy(locale);
  const ctaUrl = appUrl.replace(/\/+$/, "");

  return (
    <EmailShell
      preview={c.preview}
      appUrl={appUrl}
      locale={locale}
      footer={{ reason: c.footerReason }}
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
          href={ctaUrl}
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
    </EmailShell>
  );
}

export default NewsletterWelcomeEmail;
