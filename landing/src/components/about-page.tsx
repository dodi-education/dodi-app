import { LandingInteractions } from "@/components/landing-interactions";
import { buildLinks, createT, SiteFooter, SiteHeader } from "@/components/site/chrome";
import {
  Code,
  Github,
  Mic,
  Shield,
  SmileyHappy,
  TrendingUp,
  UsersGroup,
} from "@/components/site/icons";
import type { Locale } from "@/lib/site";

/**
 * The About page, ported from the design's about.html. The hero headline uses a
 * locale-specific inline layout (the "do-di-fferently" wordplay in English, a
 * simpler accented phrase in German), matching the design's data-i18n-html swap.
 */
export function AboutPage({ locale }: { locale: Locale }) {
  const links = buildLinks(locale);
  const t = createT(locale, "about");
  const tl = createT(locale, "landing");
  return (
    <>
      <SiteHeader locale={locale} links={links} active="about" />
      <main>
        <section className="page-hero center">
          <div className="wrap wrap--narrow">
            <div className="reveal">
              <img
                src="/site/assets/dodi-mascot.png"
                alt="dodi, the friendly dodo"
                className="mascot-bob"
                style={{ width: 120, margin: "0 auto 18px" }}
              />
              <span className="eyebrow coral">{t("eyebrow")}</span>
              {locale === "de" ? (
                <h1 style={{ marginTop: 14 }}>
                  Wir machen es{" "}
                  <span className="accent" style={{ color: "var(--brand)" }}>
                    anders
                  </span>
                </h1>
              ) : (
                <h1 style={{ marginTop: 14 }}>
                  We{" "}
                  <span className="accent" style={{ color: "var(--brand)" }}>
                  do
                  </span>
                  {" "}things{" "}
                  <span className="accent" style={{ color: "var(--brand)" }}>
                    di
                  </span>
                  fferently
                </h1>
              )}
              <p className="lead">{t("heroLead")}</p>
            </div>
          </div>
        </section>

        {/* Story */}
        <section className="section" style={{ paddingTop: "clamp(40px,5vw,72px)" }}>
          <div className="wrap">
            <div className="story">
              <div className="reveal">
                <h2>{t("storyTitle")}</h2>
                <p>{t("story1")}</p>
                <p>{t("story2")}</p>
              </div>

              <div className="founder-card reveal">
                <img className="founder-avatar" src="/site/assets/founder.jpg" alt={t("founderName")} />
                <div>
                  <div className="fn">{t("founderName")}</div>
                  <div className="fr">{t("founderRole")}</div>
                  <p className="fbio">{t("founderBio")}</p>
                </div>
              </div>

              <div className="reveal">
                <h2>{t("whyDodoTitle")}</h2>
                <p>{t("dodo1")}</p>
                <p>{t("dodo2")}</p>
                <p>{t("dodo3")}</p>
                <p>
                  <span className="lead-in">{t("dodo4LeadIn")}</span> {t("dodo4Rest")}
                </p>
              </div>

              <div className="fact-card reveal">
                <img src="/site/assets/dodi-mascot.png" alt="" />
                <p className="fc-quote fc-fact">
                  <span className="accent">{t("factLabel")}</span> {t("factBody")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section
          className="section"
          style={{ background: "linear-gradient(180deg,#fff,var(--sky-bot))", paddingTop: 0 }}
        >
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">{t("principlesEyebrow")}</span>
              <h2>{t("principlesTitle")}</h2>
              <p className="lead">{t("principlesLead")}</p>
            </div>
            <div className="values-grid">
              <Principle chip="mint" icon={<Shield />} title={t("pr1Title")} body={t("pr1Body")} cls="reveal" />
              <Principle chip="coral" icon={<SmileyHappy />} title={t("pr2Title")} body={t("pr2Body")} cls="reveal d1" />
              <Principle chip="amber" icon={<Mic />} title={t("pr3Title")} body={t("pr3Body")} cls="reveal d2" />
              <Principle chip="blue" icon={<TrendingUp />} title={t("pr4Title")} body={t("pr4Body")} cls="reveal" />
              <Principle chip="pink" icon={<UsersGroup />} title={t("pr5Title")} body={t("pr5Body")} cls="reveal d1" />
              <Principle chip="violet" icon={<Code sw={1.9} />} title={t("pr6Title")} body={t("pr6Body")} cls="reveal d2" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="section cta-final">
          <div className="wrap wrap--narrow reveal">
            <h2>{t("ctaTitle")}</h2>
            <p className="lead">{t("ctaLead")}</p>
            <div className="hero-cta">
              <a className="btn btn--primary btn--lg" href={links.register}>
                {tl("cta.getStarted")}
              </a>
              <a
                className="btn btn--ghost btn--lg"
                href={links.github}
                target="_blank"
                rel="noopener"
              >
                <Github style={{ width: "1.15em", height: "1.15em" }} />
                {tl("cta.starGithub")}
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} links={links} />
      <LandingInteractions />
    </>
  );
}

function Principle({
  chip,
  icon,
  title,
  body,
  cls,
}: {
  chip: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cls: string;
}) {
  return (
    <div className={`value ${cls}`}>
      <span className={`icon-chip ${chip}`}>{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
