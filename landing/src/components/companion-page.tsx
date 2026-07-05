import { LandingInteractions } from "@/components/landing-interactions";
import { NewsletterForm } from "@/components/newsletter-form";
import { buildLinks, createT, SiteFooter, SiteHeader } from "@/components/site/chrome";
import {
  ArrowRight,
  Check,
  Clock,
  Eye,
  Heart,
  Lock,
  Mic,
  Moon,
  Music,
  Shield,
  SmileyHappy,
  Sun,
  Users,
} from "@/components/site/icons";
import type { Locale } from "@/lib/site";

/**
 * The Companion device page, ported from the design's companion.html. Its header
 * CTA is "Reserve yours" (anchoring to the on-page newsletter section). The E2EE
 * scramble demo is driven by <LandingInteractions>; the newsletter signup is the
 * client <NewsletterForm>.
 */
export function CompanionPage({ locale }: { locale: Locale }) {
  const links = buildLinks(locale);
  const t = createT(locale, "companion");
  return (
    <>
      <SiteHeader
        locale={locale}
        links={links}
        active="companion"
        headerCta={{ label: t("reserve"), href: "#newsletter" }}
      />
      <main>
        <section className="page-hero">
          <div className="wrap device-hero-grid">
            <div className="reveal">
              <span className="avail-badge soon">
                <Clock sw={2.2} /> {t("shipping2027")}
              </span>
              <h1 style={{ marginTop: 18 }}>{t("heroTitle")}</h1>
              <p className="lead">{t("heroLead")}</p>
              <div className="hero-cta">
                <a className="btn btn--coral btn--lg" href="#newsletter">
                  {t("reserve")}
                </a>
                <a className="btn btn--ghost btn--lg" href="#privacy">
                  {t("howPrivacy")}
                </a>
              </div>
            </div>
            <div className="device-stage reveal d1">
              <div className="device-photo">
                <img
                  src="/site/assets/companion-shot.jpg"
                  alt="The dodi Companion, a soft blue spherical device with a round screen showing a friendly face wearing headphones"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Same brain reassurance */}
        <section className="section section--tight">
          <div className="wrap">
            <div className="section-head reveal" style={{ marginBottom: 0 }}>
              <span
                className="avail-badge"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                <Check sw={2.4} /> {t("optionalAddon")}
              </span>
              <h2 style={{ marginTop: 14 }}>{t("sameBrainTitle")}</h2>
              <p className="lead">{t("sameBrainLead")}</p>
            </div>
          </div>
        </section>

        {/* Advantages */}
        <section
          className="section"
          style={{ background: "linear-gradient(180deg,#fff,var(--sky-bot))", paddingTop: 0 }}
        >
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow coral">{t("whyDeviceEyebrow")}</span>
              <h2>{t("whyDeviceTitle")}</h2>
            </div>
            <div className="values-grid">
              <Value chip="mint" icon={<SmileyHappy />} title={t("v1Title")} body={t("v1Body")} cls="reveal" />
              <Value chip="blue" icon={<Mic />} title={t("v2Title")} body={t("v2Body")} cls="reveal d1" />
              <Value chip="coral" icon={<Heart />} title={t("v3Title")} body={t("v3Body")} cls="reveal d2" />
              <Value chip="violet" icon={<Sun />} title={t("v4Title")} body={t("v4Body")} cls="reveal" />
              <Value chip="amber" icon={<Shield />} title={t("v5Title")} body={t("v5Body")} cls="reveal d1" />
              <Value chip="mint" icon={<Users />} title={t("v6Title")} body={t("v6Body")} cls="reveal d2" />
            </div>
          </div>
        </section>

        {/* Privacy (deep band) */}
        <section className="section band-deep" id="privacy">
          <div className="wrap">
            <div
              className="section-head reveal"
              style={{ textAlign: "left", maxWidth: 680, marginBottom: 48 }}
            >
              <span className="eyebrow on-dark">{t("privacyEyebrow")}</span>
              <h2 style={{ marginTop: 14 }}>{t("privacyTitle")}</h2>
              <p className="lead" style={{ marginTop: 16 }}>
                {t("privacyLead")}
              </p>
            </div>
            <div className="privacy-grid">
              <div className="reveal">
                <div className="privacy-list">
                  <PrivacyItem icon={<Lock />} title={t("p1Title")} body={t("p1Body")} />
                  <PrivacyItem icon={<Eye />} title={t("p2Title")} body={t("p2Body")} />
                  <PrivacyItem icon={<Lock />} title={t("p3Title")} body={t("p3Body")} />
                  <PrivacyItem icon={<Shield />} title={t("p4Title")} body={t("p4Body")} />
                  <PrivacyItem icon={<Moon />} title={t("p5Title")} body={t("p5Body")} />
                </div>
              </div>
              <div className="os-card reveal d1" style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    color: "#fff",
                    fontSize: "1.3rem",
                    marginBottom: 22,
                  }}
                >
                  {t("encryptionInAction")}
                </div>
                <div className="e2ee-demo" id="e2ee-demo">
                  <span className="lock" aria-hidden="true">
                    <svg
                      className="l-open"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </svg>
                    <svg
                      className="l-closed"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <span className="e2ee-text" data-plain={t("e2eePlain")}>
                    {t("e2eePlain")}
                  </span>
                </div>
                <p style={{ marginTop: 18 }}>{t("encryptionCaption")}</p>
                <a
                  className="textlink"
                  href={links.appAi}
                  style={{ color: "#9FC2F2", justifyContent: "center" }}
                >
                  {t("seeDataHandled")} <ArrowRight />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Private home server */}
        <section style={{ background: "linear-gradient(180deg,#F1F7FD,#fff)" }}>
          <div className="wrap">
            <div className="feature-row">
              <div className="fr-copy reveal">
                <span className="eyebrow mint">{t("homeServerEyebrow")}</span>
                <h3>{t("homeServerTitle")}</h3>
                <p>{t("homeServerBody")}</p>
                <ul className="fr-list">
                  <li>
                    <Check sw={2.4} />
                    <span>
                      <b>{t("hs1Bold")}</b>
                      {t("hs1Rest")}
                    </span>
                  </li>
                  <li>
                    <Check sw={2.4} />
                    <span>
                      <b>{t("hs2Bold")}</b>
                      {t("hs2Rest")}
                    </span>
                  </li>
                  <li>
                    <Check sw={2.4} />
                    <span>
                      <b>{t("hs3Bold")}</b>
                      {t("hs3Rest")}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="fr-visual reveal d1">
                <div className="fr-visual-inner halo">
                  <div className="mk-frame">
                    <div className="mk-bar">
                      <span className="mk-dot r" />
                      <span className="mk-dot y" />
                      <span className="mk-dot g" />
                      <span className="mk-label">{t("hsLabel")}</span>
                    </div>
                    <div className="mk-body">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="mk-h">{t("hsRunning")}</span>
                        <span className="mk-connected">
                          <span className="d" /> {t("hsOnline")}
                        </span>
                      </div>
                      <div className="mk-sub" style={{ marginBottom: 10 }}>
                        {t("hsSub")}
                      </div>
                      <div className="mk-log">
                        <span className="ldot g" /> {t("hsLog1")} <time>06:40</time>
                      </div>
                      <div className="mk-log">
                        <span className="ldot b" /> {t("hsLog2")} <time>06:42</time>
                      </div>
                      <div className="mk-log">
                        <span className="ldot g" /> {t("hsLog3")} <time>06:45</time>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Specs */}
        <section className="section">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">{t("hardwareEyebrow")}</span>
              <h2>{t("hardwareTitle")}</h2>
              <p className="lead">{t("hardwareLead")}</p>
            </div>
            <div className="spec-grid">
              <Spec icon={<Shield />} title={t("s1Title")} body={t("s1Body")} cls="reveal" />
              <Spec
                icon={<SmileyHappy />}
                title={t("s2Title")}
                body={t("s2Body")}
                cls="reveal d1"
                iconStyle={{ background: "var(--coral-soft)", color: "var(--coral-700)" }}
              />
              <Spec
                icon={<Mic />}
                title={t("s3Title")}
                body={t("s3Body")}
                cls="reveal d2"
                iconStyle={{ background: "var(--mint-soft)", color: "var(--mint)" }}
              />
              <Spec
                icon={<Music />}
                title={t("s4Title")}
                body={t("s4Body")}
                cls="reveal d3"
                iconStyle={{ background: "var(--violet-soft)", color: "var(--violet)" }}
              />
            </div>
          </div>
        </section>

        {/* Newsletter */}
        <section
          className="section section--tight"
          id="newsletter"
          style={{ background: "linear-gradient(180deg,#fff,var(--sky-bot))" }}
        >
          <div className="wrap">
            <div className="newsletter-box reveal">
              <h3>{t("newsletterTitle")}</h3>
              <p>{t("newsletterBody")}</p>
              <NewsletterForm
                locale={locale}
                list="newsletter"
                labels={{
                  placeholder: t("emailPlaceholder"),
                  notifyMe: t("notifyMe"),
                  sending: t("newsletterSending"),
                  done: t("newsletterDone"),
                  invalid: t("newsletterInvalid"),
                  rateLimited: t("newsletterRateLimited"),
                  error: t("newsletterError"),
                }}
              />
              <p className="newsletter-note">{t("newsletterNote")}</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} links={links} />
      <LandingInteractions />
    </>
  );
}

function Value({
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

function PrivacyItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="privacy-item">
      <span className="pi-ic">{icon}</span>
      <div>
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
    </div>
  );
}

function Spec({
  icon,
  title,
  body,
  cls,
  iconStyle,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cls: string;
  iconStyle?: React.CSSProperties;
}) {
  return (
    <div className={`spec ${cls}`}>
      <span className="si" style={iconStyle}>
        {icon}
      </span>
      <h4>{title}</h4>
      <p>{body}</p>
    </div>
  );
}
