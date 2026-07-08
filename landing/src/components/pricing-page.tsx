import { LandingInteractions } from "@/components/landing-interactions";
import { buildLinks, createT, SiteFooter, SiteHeader } from "@/components/site/chrome";
import { Check, Code, Github, Key, Plus } from "@/components/site/icons";
import type { Locale } from "@/lib/site";

/**
 * The Pricing page. dodi is bring-your-own-key, so this page frames the plans
 * around that: you connect your own AI key and pay the provider directly, while
 * the dodi tier only unlocks platform allowances (kids, personas, snapshots,
 * memory depth). Four tiers (Free / Hatchling / Strider / Apex dodo), with
 * Strider highlighted. Static server component — reveal + mobile nav come from
 * <LandingInteractions>, and the FAQ uses native <details> so it needs no JS.
 */

/** Tier ids map to the `pricing` message catalogue (t0Name, t0Price, …). */
const TIERS = ["t0", "t1", "t2", "t3"] as const;
const FEATURED = "t2";

/** Rows that carry a per-tier value (message key suffix → row label key). */
const VALUE_ROWS = [
  { suffix: "Kids", label: "rowKids" },
  { suffix: "Personas", label: "rowPersonas" },
  { suffix: "Snapshots", label: "rowSnapshots" },
  { suffix: "Memory", label: "rowMemory" },
] as const;

/** Rows that are simply included on every plan. */
const INCLUDED_ROWS = ["rowVoice", "rowStudio", "rowKeys", "rowE2ee", "rowOpen", "rowFriends"];

const FAQ_ITEMS = ["1", "2", "3", "4", "5", "6"];

export function PricingPage({ locale }: { locale: Locale }) {
  const links = buildLinks(locale);
  const t = createT(locale, "pricing");

  return (
    <>
      <SiteHeader
        locale={locale}
        links={links}
        active="pricing"
        headerCta={{ label: t("startFree"), href: links.register }}
      />
      <main>
        {/* Hero */}
        <section className="page-hero center">
          <div className="wrap wrap--narrow">
            <span className="eyebrow">
              <Key sw={2} /> {t("eyebrow")}
            </span>
            <h1>{t("heroTitle")}</h1>
            <p className="lead">{t("heroLead")}</p>
            <div className="hero-cta">
              <a className="btn btn--primary btn--lg" href={links.register}>
                {t("startFree")}
              </a>
              <a className="btn btn--ghost btn--lg" href="#compare">
                {t("comparePlans")}
              </a>
            </div>
          </div>
        </section>

        {/* Plan cards */}
        <section className="section" id="plans">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">{t("plansEyebrow")}</span>
              <h2>{t("plansTitle")}</h2>
              <p className="lead">{t("plansLead")}</p>
            </div>
            <div className="pricing-grid">
              {TIERS.map((id, i) => (
                <PriceCard
                  key={id}
                  t={t}
                  id={id}
                  featured={id === FEATURED}
                  href={links.register}
                  cls={`reveal${i > 0 ? ` d${i}` : ""}`}
                />
              ))}
            </div>
            <p className="pricing-note reveal">
              <Check sw={2.6} /> {t("cardNote")}
            </p>
          </div>
        </section>

        {/* Full comparison table */}
        <section className="section band-soft" id="compare">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">{t("compareEyebrow")}</span>
              <h2>{t("compareTitle")}</h2>
            </div>
            <div className="compare-wrap reveal">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th className="ct-feature" scope="col">
                      {t("compareFeature")}
                    </th>
                    {TIERS.map((id) => (
                      <th
                        key={id}
                        scope="col"
                        className={id === FEATURED ? "ct-featured" : undefined}
                      >
                        <span className="ct-name">{t(`${id}Name`)}</span>
                        <span className="ct-price">
                          {t(`${id}Price`)}
                          {id !== "t0" && ` ${t("perMonth")}`}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <GroupRow label={t("grpFamily")} />
                  {VALUE_ROWS.map((row) => (
                    <tr key={row.suffix}>
                      <td className="ct-feature">{t(row.label)}</td>
                      {TIERS.map((id) => (
                        <td key={id} className={id === FEATURED ? "ct-featured" : undefined}>
                          {t(`${id}${row.suffix}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <GroupRow label={t("grpIncluded")} />
                  {INCLUDED_ROWS.map((row) => (
                    <tr key={row}>
                      <td className="ct-feature">{t(row)}</td>
                      {TIERS.map((id) => (
                        <td key={id} className={id === FEATURED ? "ct-featured" : undefined}>
                          <span className="ct-check" aria-label="Included">
                            <Check sw={2.6} />
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Self-host band */}
        <section className="section band-deep">
          <div className="wrap">
            <div className="self-host reveal">
              <span className="os-mark">
                <Code sw={2} />
              </span>
              <span className="eyebrow on-dark">{t("selfEyebrow")}</span>
              <h2>{t("selfTitle")}</h2>
              <p className="lead">{t("selfBody")}</p>
              <a className="btn btn--on-dark btn--lg" href={links.github} target="_blank" rel="noopener">
                <Github /> {t("selfCta")}
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section section--tight">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">{t("faqEyebrow")}</span>
              <h2>{t("faqTitle")}</h2>
            </div>
            <div className="faq-list reveal">
              {FAQ_ITEMS.map((n) => (
                <details className="faq-item" key={n}>
                  <summary className="faq-q">
                    {t(`q${n}`)}
                    <span className="faq-icon" aria-hidden="true">
                      <Plus sw={2.2} />
                    </span>
                  </summary>
                  <div className="faq-a">{t(`a${n}`)}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="section cta-final">
          <div className="wrap">
            <div className="section-head reveal" style={{ marginBottom: 0 }}>
              <img className="cta-mascot" src="/site/assets/dodi-mascot.png" alt="" />
              <h2>{t("ctaTitle")}</h2>
              <p className="lead">{t("ctaLead")}</p>
              <div className="hero-cta">
                <a className="btn btn--primary btn--lg" href={links.register}>
                  {t("ctaStart")}
                </a>
                <a className="btn btn--ghost btn--lg" href={links.github} target="_blank" rel="noopener">
                  <Github /> {t("ctaStar")}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} links={links} />
      <LandingInteractions />
    </>
  );
}

function PriceCard({
  t,
  id,
  featured,
  href,
  cls,
}: {
  t: (key: string) => string;
  id: string;
  featured: boolean;
  href: string;
  cls: string;
}) {
  const isFree = id === "t0";
  return (
    <div className={`price-card ${cls}${featured ? " featured" : ""}`}>
      {featured && <span className="pc-badge">{t("mostPopular")}</span>}
      <div className="pc-name">{t(`${id}Name`)}</div>
      <p className="pc-tagline">{t(`${id}Tagline`)}</p>
      <div className="pc-price">
        <span className="amount">{t(`${id}Price`)}</span>
        {!isFree && <span className="period">{t("perMonth")}</span>}
      </div>
      <div className="pc-price-note">{isFree ? t("freeForever") : t("billedMonthly")}</div>
      <a className={`btn pc-cta ${featured ? "btn--primary" : "btn--ghost"}`} href={href}>
        {t(`${id}Cta`)}
      </a>
      <ul className="pc-features">
        {VALUE_ROWS.map((row) => (
          <li className="pc-feat" key={row.suffix}>
            <span className="k">{t(row.label)}</span>
            <span className="v">{t(`${id}${row.suffix}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupRow({ label }: { label: string }) {
  return (
    <tr className="ct-group">
      <td colSpan={5}>{label}</td>
    </tr>
  );
}
