/**
 * The shared dodi email shell — the reusable frame every transactional email
 * renders inside. Keeps branding (logo, palette, footer) in one place so new
 * email types only supply their body. Styles are inline because email clients
 * strip <style>/class-based CSS; Nunito is loaded via @import for the clients
 * that support webfonts, falling back to the system sans stack elsewhere.
 */
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

import { type EmailLocale, layoutCopy } from "./strings";
import { colors, emailAssetBaseUrl, fontStack } from "./theme";

export interface EmailShellProps {
  /** Inbox preview text (hidden in the body). */
  preview: string;
  /** Web app origin (NEXT_PUBLIC_APP_URL) — used for the logo + settings link. */
  appUrl: string;
  locale: EmailLocale;
  children: ReactNode;
}

export function EmailShell({ preview, appUrl, locale, children }: EmailShellProps) {
  const c = layoutCopy(locale);
  const origin = appUrl.replace(/\/+$/, "");
  // Logo is served by the platform (api.dodi.app), not the web app; links point
  // at the web app (app.dodi.app).
  const logoUrl = `${emailAssetBaseUrl()}/dodi-logo.png`;
  const settingsUrl = `${origin}/parent/settings/notifications`;

  return (
    <Html lang={locale}>
      <Head>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');`}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.bg,
          margin: 0,
          padding: "32px 12px",
          fontFamily: fontStack,
        }}
      >
        <Container style={{ maxWidth: 480, margin: "0 auto" }}>
          <Section style={{ padding: "2px 6px 18px" }}>
            <Img
              src={logoUrl}
              alt="dodi"
              width={116}
              height={45}
              style={{ display: "block", border: 0, outline: "none" }}
            />
          </Section>

          <Section
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 14,
              padding: "28px 28px 30px",
            }}
          >
            {children}
          </Section>

          <Section style={{ padding: "18px 8px 4px" }}>
            <Text
              style={{
                margin: 0,
                fontFamily: fontStack,
                fontSize: 12,
                lineHeight: "18px",
                color: colors.muted,
              }}
            >
              {c.footerReason}{" "}<br />
              <Link
                href={settingsUrl}
                style={{ color: colors.muted, textDecoration: "underline" }}
              >
                {c.footerManage}
              </Link>
              .
            </Text>
            <Text
              style={{
                margin: "10px 0 0",
                fontFamily: fontStack,
                fontSize: 12,
                color: colors.muted,
              }}
            >
              {c.tagline}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
