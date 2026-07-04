import { LandingInteractions } from "@/components/landing-interactions";
import {
  buildLinks,
  createT,
  type Links,
  SiteFooter,
  SiteHeader,
} from "@/components/site/chrome";
import {
  ArrowRight,
  Brain,
  Check,
  Clock,
  Code,
  Eye,
  Gear,
  Github,
  Globe,
  Home,
  Key,
  Lock,
  Mic,
  Shield,
  Smiley,
  Sparkle,
} from "@/components/site/icons";
import type { Locale } from "@/lib/site";

/**
 * The marketing home page, ported from the Claude Design project's index.html.
 * Rendered per-locale as a server component: translations resolve at build time
 * via `createTranslator` (sync, no provider), so /en and /de are fully static
 * with correct <html lang> and SEO metadata. Header, footer, icons and the
 * link map are shared with the Platform / Companion / About pages via
 * components/site/*. Interactive behaviour (sticky header, mobile nav, reveal,
 * the scroll-driven dodo animation) lives in the <LandingInteractions> island.
 */
export function LandingPage({ locale }: { locale: Locale }) {
  const links = buildLinks(locale);
  return (
    <>
      <SiteHeader locale={locale} links={links} active="home" />
      <main>
        <Hero locale={locale} links={links} />
        <TrustStrip locale={locale} />
        <Pillars locale={locale} links={links} />
        <HowItWorks locale={locale} />
        <Products locale={locale} links={links} />
        <PrivacyBand locale={locale} links={links} />
        <AboutTeaser locale={locale} links={links} />
        <FinalCta locale={locale} links={links} />
      </main>
      <SiteFooter locale={locale} links={links} />
      <LandingInteractions />
    </>
  );
}

interface SectionProps {
  locale: Locale;
  links: Links;
}

// ── Hero (full-bleed photo) ───────────────────────────────────────
function Hero({ locale, links }: SectionProps) {
  const t = createT(locale, "landing");
  const tc = createT(locale, "common");
  return (
    <section className="hero-full">
      <img
        src="/site/assets/hero-wide.jpg"
        alt="A smiling girl sitting cross-legged on a sunny living-room floor, holding up a tablet running dodi"
      />
      <div className="hero-full-copy">
        <div className="wrap">
          <span className="eyebrow">
            <Sparkle />
            {t("hero.eyebrow")}
          </span>
          <h1>{t("hero.title")}</h1>
          <p className="hero-sub">{t("hero.subtitle")}</p>
          <div className="hero-cta">
            <a className="btn btn--primary btn--lg" href={links.register}>
              {t("cta.getStarted")}
            </a>
            <a className="btn btn--ghost-dark btn--lg" href={links.howItWorks}>
              {t("hero.seeHow")}
            </a>
          </div>
          <div className="hero-trust">
            <span>
              <Check sw={2.4} /> {tc("openSource")}
            </span>
            <span>
              <Check sw={2.4} /> {tc("privacyFirst")}
            </span>
            <span>
              <Check sw={2.4} /> {t("hero.trustDevices")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Trust strip ───────────────────────────────────────────────────
function TrustStrip({ locale }: { locale: Locale }) {
  const t = createT(locale, "landing");
  return (
    <div className="trust-strip">
      <div className="wrap">
        <span className="trust-item">
          <Mic /> {t("trust.voice")}
        </span>
        <span className="trust-item">
          <Globe sw={1.9} /> {t("trust.language")}
        </span>
        <span className="trust-item">
          <Shield /> {t("trust.noAds")}
        </span>
      </div>
    </div>
  );
}

// ── Pillars ───────────────────────────────────────────────────────
function Pillars({ locale, links }: SectionProps) {
  const t = createT(locale, "landing");
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">{t("pillars.eyebrow")}</span>
          <h2>{t("pillars.title")}</h2>
          <p className="lead">{t("pillars.lead")}</p>
        </div>
        <div className="pillars">
          <a className="pillar reveal" href={links.platformMemory}>
            <span className="pill-glow" style={{ background: "var(--brand-soft)" }} />
            <span className="icon-chip blue">
              <Smiley />
            </span>
            <h3>{t("pillars.p1Title")}</h3>
            <p>{t("pillars.p1Body")}</p>
            <span className="pill-link">
              {t("pillars.p1Link")} <ArrowRight />
            </span>
          </a>

          <a className="pillar coral reveal d1" href={links.platformGames}>
            <span className="pill-glow" style={{ background: "var(--coral-soft)" }} />
            <span className="icon-chip coral">
              <Gear />
            </span>
            <h3>{t("pillars.p2Title")}</h3>
            <p>{t("pillars.p2Body")}</p>
            <span className="pill-link">
              {t("pillars.p2Link")} <ArrowRight />
            </span>
          </a>

          <a className="pillar reveal" href={links.companionPrivacy}>
            <span className="pill-glow" style={{ background: "var(--mint-soft)" }} />
            <span className="icon-chip mint">
              <Lock />
            </span>
            <h3>{t("pillars.p3Title")}</h3>
            <p>{t("pillars.p3Body")}</p>
            <span className="pill-link">
              {t("pillars.p3Link")} <ArrowRight />
            </span>
          </a>

          <a className="pillar reveal d1" href={links.github} target="_blank" rel="noopener">
            <span className="pill-glow" style={{ background: "var(--violet-soft)" }} />
            <span className="icon-chip violet">
              <Code sw={1.9} />
            </span>
            <h3>{t("pillars.p4Title")}</h3>
            <p>{t("pillars.p4Body")}</p>
            <span className="pill-link" style={{ color: "var(--violet)" }}>
              {t("pillars.p4Link")} <ArrowRight />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────
function HowItWorks({ locale }: { locale: Locale }) {
  const t = createT(locale, "landing");
  return (
    <section
      id="how-it-works"
      className="section section--tight"
      style={{ background: "linear-gradient(180deg,#fff,var(--sky-bot))" }}
    >
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">{t("how.eyebrow")}</span>
          <h2>{t("how.title")}</h2>
        </div>
        <div className="steps">
          <div className="steps-connector" />
          <div className="step reveal">
            <div className="step-num">
              <span className="step-badge">1</span>
              <span style={{ color: "var(--brand)" }}>
                <Mic sw={1.7} />
              </span>
            </div>
            <h3>{t("how.s1Title")}</h3>
            <p>{t("how.s1Body")}</p>
          </div>
          <div className="step reveal d1">
            <div className="step-num">
              <span className="step-badge">2</span>
              <span style={{ color: "var(--mint)" }}>
                <Brain sw={1.7} />
              </span>
            </div>
            <h3>{t("how.s2Title")}</h3>
            <p>{t("how.s2Body")}</p>
          </div>
          <div className="step reveal d2">
            <div className="step-num">
              <span className="step-badge">3</span>
              <span style={{ color: "var(--coral-700)" }}>
                <Sparkle sw={1.7} />
              </span>
            </div>
            <h3>{t("how.s3Title")}</h3>
            <p>{t("how.s3Body")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Products ──────────────────────────────────────────────────────
function Products({ locale, links }: SectionProps) {
  const t = createT(locale, "landing");
  return (
    <section id="products" className="section">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">{t("products.eyebrow")}</span>
          <h2>{t("products.title")}</h2>
          <p className="lead">{t("products.lead")}</p>
        </div>
        <div className="product-cards">
          <a className="product-card reveal" href={links.platform}>
            <div className="product-media platform">
              <span className="product-tag now">
                <Check sw={2.4} /> {t("products.tagNow")}
              </span>
              <img
                className="platform-pos"
                src="/site/assets/platform-shot.jpg"
                alt="Child using the dodi platform on a tablet"
              />
            </div>
            <div className="product-body">
              <h3>{t("products.platformTitle")}</h3>
              <p>{t("products.platformBody")}</p>
              <span className="textlink">
                {t("products.platformLink")} <ArrowRight />
              </span>
            </div>
          </a>
          <a className="product-card reveal d1" href={links.companion}>
            <div className="product-media companion">
              <span className="product-tag soon">
                <Clock /> {t("products.tagSoon")}
              </span>
              <img
                className="companion-pos"
                src="/site/assets/companion-shot.jpg"
                alt="The dodi Companion, a soft blue spherical device with a friendly face"
              />
            </div>
            <div className="product-body">
              <h3>{t("products.companionTitle")}</h3>
              <p>{t("products.companionBody")}</p>
              <span className="textlink coral">
                {t("products.companionLink")} <ArrowRight />
              </span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Privacy / open source deep band ───────────────────────────────
function PrivacyBand({ locale, links }: SectionProps) {
  const t = createT(locale, "landing");
  return (
    <section id="privacy" className="section band-deep">
      <div className="wrap privacy-grid">
        <div className="reveal">
          <span className="eyebrow on-dark">{t("privacy.eyebrow")}</span>
          <h2 style={{ marginTop: 14 }}>{t("privacy.title")}</h2>
          <p className="lead" style={{ marginTop: 16 }}>
            {t("privacy.lead")}
          </p>
          <div className="privacy-list">
            <div className="privacy-item">
              <span className="pi-ic">
                <Lock />
              </span>
              <div>
                <h4>{t("privacy.i1Title")}</h4>
                <p>{t("privacy.i1Body")}</p>
              </div>
            </div>
            <div className="privacy-item">
              <span className="pi-ic">
                <Key />
              </span>
              <div>
                <h4>{t("privacy.i2Title")}</h4>
                <p>{t("privacy.i2Body")}</p>
              </div>
            </div>
            <div className="privacy-item">
              <span className="pi-ic">
                <Eye />
              </span>
              <div>
                <h4>{t("privacy.i3Title")}</h4>
                <p>{t("privacy.i3Body")}</p>
              </div>
            </div>
            <div className="privacy-item">
              <span className="pi-ic">
                <Shield />
              </span>
              <div>
                <h4>{t("privacy.i4Title")}</h4>
                <p>{t("privacy.i4Body")}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="os-card reveal d1">
          <span className="os-mark">
            <Code sw={1.9} />
          </span>
          <h3>{t("privacy.osTitle")}</h3>
          <p>{t("privacy.osBody")}</p>
          <div className="os-stats">
            <div className="os-stat">
              <span className="n">
                <Code sw={1.9} /> {t("privacy.osStat1N")}
              </span>
              <span className="l">{t("privacy.osStat1L")}</span>
            </div>
            <div className="os-stat">
              <span className="n">
                <Home sw={1.9} /> {t("privacy.osStat2N")}
              </span>
              <span className="l">{t("privacy.osStat2L")}</span>
            </div>
          </div>
          <a className="btn btn--on-dark" href={links.github} target="_blank" rel="noopener">
            <Github style={{ width: "1.15em", height: "1.15em" }} />
            {t("privacy.osStar")}
          </a>
        </div>
      </div>
    </section>
  );
}

// ── About teaser ──────────────────────────────────────────────────
function AboutTeaser({ locale, links }: SectionProps) {
  const t = createT(locale, "landing");
  return (
    <section id="about" className="section about-teaser">
      <div className="wrap about-split">
        <div className="about-mascot-stage reveal">
          <div className="dodo-jumper" id="dodo-jumper" data-jump="0">
            <div className="dodo-hop">
              <div className="dodo-body">
                <img src="/site/assets/dodi-mascot.png" alt="dodi, the friendly dodo mascot" />
                <span className="dodo-eyelid" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
        <div className="reveal d1">
          <span className="eyebrow coral">{t("about.eyebrow")}</span>
          <p className="about-quote" style={{ marginTop: 14 }}>
            {t.rich("about.quote", {
              accent: (chunks) => <span className="accent">{chunks}</span>,
            })}
          </p>
          <p className="body">
            {t.rich("about.body", { em: (chunks) => <em>{chunks}</em> })}
          </p>
          <a className="textlink coral" href={links.about} style={{ marginTop: 18 }}>
            {t("about.link")} <ArrowRight />
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────
function FinalCta({ locale, links }: SectionProps) {
  const t = createT(locale, "landing");
  return (
    <section className="section cta-final">
      <div className="wrap wrap--narrow reveal">
        <img className="cta-mascot" id="cta-dodo" src="/site/assets/dodi-mascot.png" alt="" />
        <h2>{t("cta.title")}</h2>
        <p className="lead">{t("cta.lead")}</p>
        <div className="hero-cta">
          <a className="btn btn--primary btn--lg" href={links.register}>
            {t("cta.getStarted")}
          </a>
          <a
            className="btn btn--ghost btn--lg"
            href={links.github}
            target="_blank"
            rel="noopener"
          >
            <Github style={{ width: "1.15em", height: "1.15em" }} />
            {t("cta.starGithub")}
          </a>
        </div>
      </div>
    </section>
  );
}
