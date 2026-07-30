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
  /**
   * Footer override. Account emails default (undefined) to the "notifications
   * are on for your account" reason + a Manage-notifications link. Emails to
   * people without an account (e.g. newsletter subscribers) pass their own
   * reason and omit the manage link.
   */
  footer?: {
    reason: string;
    manageHref?: string;
    manageLabel?: string;
  };
  children: ReactNode;
}

export function EmailShell({ preview, appUrl, locale, footer, children }: EmailShellProps) {
  const c = layoutCopy(locale);
  const origin = appUrl.replace(/\/+$/, "");
  // Logo is served by the platform (platform.dodi.app), not the web app; links point
  // at the web app (app.dodi.app).
  const logoUrl = `${emailAssetBaseUrl()}/dodi-logo.png`;
  const settingsUrl = `${origin}/parent/settings/notifications`;

  // Default (account) footer vs. an explicit override for account-less emails.
  const footerReason = footer ? footer.reason : c.footerReason;
  const manageHref = footer ? footer.manageHref : settingsUrl;
  const manageLabel = footer ? footer.manageLabel : c.footerManage;

  return (
    <Html lang={locale}>
      <Head />
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
              width={52}
              height={20}
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
              {footerReason}
              {manageHref && manageLabel ? (
                <>
                  {" "}
                  <br />
                  <Link
                    href={manageHref}
                    style={{ color: colors.muted, textDecoration: "underline" }}
                  >
                    {manageLabel}
                  </Link>
                  .
                </>
              ) : null}
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
