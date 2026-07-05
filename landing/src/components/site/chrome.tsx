import { createTranslator } from "next-intl";
import type { ReactNode } from "react";

import { LangSwitch } from "@/components/lang-switch";
import { Code, Github, Menu, Shield } from "@/components/site/icons";
import { messages } from "@/i18n/messages";
import { APP_URL, GITHUB_URL, localePath, type Locale } from "@/lib/site";

/**
 * Permissive translator shape. next-intl's `createTranslator` types `namespace`
 * as a known literal key and derives strict per-key types from it — which a
 * dynamic, shared helper can't satisfy. We accept the trade of runtime key
 * lookup for a single reusable factory across our namespaces.
 */
export interface Translator {
  (key: string, values?: Record<string, string | number>): string;
  rich(
    key: string,
    values?: Record<string, (chunks: ReactNode) => ReactNode>,
  ): ReactNode;
}

/** Build a synchronous, provider-free translator for a given namespace. */
export function createT(locale: Locale, namespace: string): Translator {
  return createTranslator({
    locale,
    messages: messages[locale],
    namespace,
  } as never) as unknown as Translator;
}

/** Locale-aware link map shared by every page's header, footer and CTAs. */
export function buildLinks(locale: Locale) {
  const base = locale === "de" ? "/de" : "";
  return {
    home: localePath[locale],
    appPage: `${base}/app`,
    companion: `${base}/companion`,
    about: `${base}/about`,
    appMemory: `${base}/app#memory`,
    appGames: `${base}/app#games`,
    appAi: `${base}/app#ai`,
    companionPrivacy: `${base}/companion#privacy`,
    app: APP_URL,
    register: `${APP_URL}/register`,
    github: GITHUB_URL,
    howItWorks: "#how-it-works",
  };
}

export type Links = ReturnType<typeof buildLinks>;

type NavKey = "home" | "app" | "companion" | "about";

export function SiteHeader({
  locale,
  links,
  active,
  headerCta,
}: {
  locale: Locale;
  links: Links;
  active: NavKey;
  /** Overrides the primary header button; defaults to "Open the app". */
  headerCta?: { label: string; href: string };
}) {
  const t = createT(locale, "landing");
  const cta = headerCta ?? { label: t("nav.openApp"), href: links.app };
  return (
    <header className="site-header">
      <div className="wrap">
        <a className="brand-logo" href={links.home} aria-label="dodi home">
          <img src="/site/assets/dodi-logo.png" alt="dodi" />
        </a>
        <nav className="main-nav" aria-label="Primary">
          <a href={links.appPage} className={active === "app" ? "active" : undefined}>
            {t("nav.app")}
          </a>
          <a href={links.companion} className={active === "companion" ? "active" : undefined}>
            {t("nav.companion")}
          </a>
          <a href={links.about} className={active === "about" ? "active" : undefined}>
            {t("nav.about")}
          </a>
        </nav>
        <div className="header-actions">
          <LangSwitch locale={locale} />
          <a
            className="gh-pill"
            href={links.github}
            target="_blank"
            rel="noopener"
            aria-label="dodi on GitHub"
          >
            <Github />
            {t("nav.openSource")}
          </a>
          <a className="btn btn--primary" href={cta.href}>
            {cta.label}
          </a>
        </div>
        <button className="nav-toggle" aria-label="Menu" aria-expanded="false">
          <Menu />
        </button>
      </div>
    </header>
  );
}

export function SiteFooter({ locale, links }: { locale: Locale; links: Links }) {
  const t = createT(locale, "landing");
  const tc = createT(locale, "common");
  const year = String(new Date().getFullYear());
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <a className="brand-logo" href={links.home}>
              <img src="/site/assets/dodi-wordmark-white.svg" alt="dodi" />
            </a>
            <p>{t("footer.tagline")}</p>
          </div>
          <div className="footer-col">
            <h5>{t("footer.product")}</h5>
            <a href={links.appPage}>{t("nav.app")}</a>
            <a href={links.companion}>{t("nav.companion")}</a>
            <a href={links.app}>{t("nav.openApp")}</a>
          </div>
          <div className="footer-col">
            <h5>{t("footer.company")}</h5>
            <a href={links.about}>{t("footer.aboutDodi")}</a>
            <a href={links.github} target="_blank" rel="noopener">
              {t("footer.github")}
            </a>
          </div>
          <div className="footer-col">
            <h5>{t("footer.howItWorks")}</h5>
            <a href={links.appMemory}>{t("footer.linkMemory")}</a>
            <a href={links.appGames}>{t("footer.linkGames")}</a>
            <a href={links.companionPrivacy}>{t("footer.linkPrivacy")}</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{t("footer.copyright", { year })}</span>
          <span className="fb-badges">
            <span>
              <Code sw={2} /> {tc("openSource")}
            </span>
            <span>
              <Shield sw={2} /> {tc("privacyFirst")}
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
