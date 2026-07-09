import { LandingInteractions } from "@/components/landing-interactions";
import {
  buildLinks,
  createT,
  SiteFooter,
  SiteHeader,
  type Translator,
} from "@/components/site/chrome";
import {
  Caret,
  Check,
  Clock,
  Github,
  HelpCircle,
  Key,
  Lock,
  Server,
  Shield,
  Sparkle,
} from "@/components/site/icons";
import type { Locale } from "@/lib/site";
import type { ReactNode } from "react";

/**
 * The Pricing page. Each plan can run in one of two AI modes — all-inclusive
 * "dodi AI" (we meter usage) or bring-your-own-key — and bills monthly or
 * annually (annual = 10× monthly, i.e. two months free). Both toggles are pure
 * client enhancement: the page server-renders the default (dodi AI · monthly)
 * state, and <LandingInteractions> swaps prices, per-labels and `.only-*`
 * visibility on click, persisting the choice to localStorage. With JS off the
 * default state is fully readable, and the FAQ / rate card use native
 * <details> so they need no JS at all.
 *
 * Prices and the "for the curious" rate matrix are locale-invariant data, so
 * they live as constants here; every piece of prose comes from the `pricing`
 * message catalogue.
 */

/** Three tiers. `m`/`y` are the monthly / annual platform fee in €; they double
 *  as the billing toggle's data-* source, so they belong here, not in i18n. */
const PLANS = [
  { id: "t1", featured: false, m: 9, y: 90, avatar: "plan-hatchling", hasRates: false },
  { id: "t2", featured: true, m: 19, y: 190, avatar: "plan-strider", hasRates: true },
  { id: "t3", featured: false, m: 39, y: 390, avatar: "plan-apex", hasRates: true },
] as const;

/** Full AI usage rates — locale-invariant, shown in the "for the curious" card.
 *  Cells are one string per tier (input / output where two numbers apply). */
const RATE_TEXT = [
  { name: "Claude Sonnet 5", cells: ["5.18 / 25.92", "4.21 / 21.06", "3.73 / 18.63"] },
  { name: "Claude Opus 4.8", cells: ["10.37 / 51.84", "8.42 / 42.12", "7.45 / 37.26"] },
  { name: "Claude Fable 5", cells: ["20.74 / 103.68", "16.85 / 84.24", "14.90 / 74.52"] },
] as const;
const RATE_IMG = [
  { name: "Nano Banana 2 Lite", cells: ["0.10", "0.08", "0.07"] },
  { name: "Nano Banana 2", cells: ["0.17", "0.14", "0.12"] },
] as const;

/** Usage calculator (dodi AI mode). Per-model, per-tier € rates power a live
 *  "what does my balance buy" estimate. Text models estimate game creations /
 *  edits; voice estimates minutes. Token assumptions for a game live in the
 *  client script; rates here stay the single source of truth for the maths. */
const CALC_MODELS = [
  { id: "voice", kind: "voice", label: null, rate: "0.09,0.075,0.066" },
  { id: "sonnet", kind: "text", label: "Sonnet 5", input: "5.18,4.21,3.73", output: "25.92,21.06,18.63" },
  { id: "opus", kind: "text", label: "Opus 4.8", input: "10.37,8.42,7.45", output: "51.84,42.12,37.26" },
  { id: "fable", kind: "text", label: "Fable 5", input: "20.74,16.85,14.90", output: "103.68,84.24,74.52" },
] as const;

const FAQ_ITEMS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

export function PricingPage({ locale }: { locale: Locale }) {
  const links = buildLinks(locale);
  const t = createT(locale, "pricing");

  return (
    <>
      <SiteHeader locale={locale} links={links} active="pricing" />
      <main
        className="pricing-main"
        data-mode="dodi"
        data-billing="monthly"
        data-lbl-month={t("perMonthLabel")}
        data-lbl-year={t("perYearLabel")}
        data-lbl-save={t("wasSaveLabel")}
      >
        {/* Hero · mode picker · billing toggle · plan cards · rate card */}
        <section className="pricing-hero">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">
                <Sparkle /> {t("eyebrow")}
              </span>
              <h1>{t("heroTitle")}</h1>
              <p className="lead">{t("heroLead")}</p>
            </div>

            <div className="mode-picker-row">
              <span className="mode-label">{t("modeQuestion")}</span>
              <div className="mode-picker" role="group" aria-label={t("modeQuestion")}>
                <button type="button" className="mode-card" data-mode-btn="dodi" aria-pressed="true">
                  <span className="mc-head">
                    <Sparkle />
                    {t("modeDodiName")}
                    <span className="mc-tag">{t("modeDodiTag")}</span>
                  </span>
                  <span className="mc-sub">{t("modeDodiSub")}</span>
                </button>
                <button type="button" className="mode-card" data-mode-btn="byok" aria-pressed="false">
                  <span className="mc-head">
                    <Key />
                    {t("modeByokName")}
                    <span className="mc-tag mc-tag--alt">{t("modeByokTag")}</span>
                  </span>
                  <span className="mc-sub">{t("modeByokSub")}</span>
                </button>
              </div>
            </div>

            <div className="billing-toggle-row">
              <div className="billing-toggle" role="group" aria-label={t("billingAria")}>
                <button type="button" data-billing="monthly" aria-pressed="true">
                  {t("billingMonthly")}
                </button>
                <button type="button" data-billing="annual" aria-pressed="false">
                  {t("billingAnnual")} <span className="save-tag">{t("billingSave")}</span>
                </button>
              </div>
              <p className="byok-note">
                <strong>{t("trialNoteStrong")}</strong>{" "}
                <span className="only-dodi">{t("trialNoteDodi")}</span>
                <span className="only-byok">{t("trialNoteByok")}</span>
              </p>
            </div>

            <div className="plans">
              {PLANS.map((p) => (
                <PlanCard key={p.id} t={t} plan={p} href={links.register} />
              ))}
            </div>
            <p className="plans-note">{t("plansVatNote")}</p>

            <UsageCalc t={t} />
            <RateCard t={t} />
          </div>
        </section>

        {/* Included on every plan */}
        <div className="all-plans-strip">
          <div className="wrap">
            <span className="aps-label">{t("stripLabel")}</span>
            <span className="trust-item">
              <Clock sw={1.9} /> {t("stripTrial")}
            </span>
            <span className="trust-item">
              <Key sw={1.9} /> {t("stripKeys")}
            </span>
            <span className="trust-item">
              <Lock sw={1.9} /> {t("stripE2ee")}
            </span>
            <span className="trust-item">
              <Shield sw={1.9} /> {t("stripNoAds")}
            </span>
          </div>
        </div>

        {/* Testimonials */}
        <section className="section quote-band">
          <div className="wrap">
            <div className="quotes-grid">
              <Quote t={t} n="1" />
              <Quote t={t} n="2" variant="violet" />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section faq-band">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">
                <HelpCircle /> {t("faqEyebrow")}
              </span>
              <h2>{t("faqTitle")}</h2>
              <p className="lead">{t("faqLead")}</p>
            </div>
            <div className="faq-list">
              {FAQ_ITEMS.map((n) => (
                <details className="faq-item" key={n}>
                  <summary>
                    {t(`q${n}`)}
                    <Caret sw={2.2} />
                  </summary>
                  <div className="faq-a">
                    <p>{t(`a${n}`)}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Self-host */}
        <section className="section selfhost-band">
          <div className="wrap">
            <div className="selfhost-card">
              <span className="eyebrow">
                <Server /> {t("selfEyebrow")}
              </span>
              <h2>{t("selfTitle")}</h2>
              <p>{t("selfBody")}</p>
              <a className="btn btn--ghost" href={links.github} target="_blank" rel="noopener">
                <Github /> {t("selfCta")}
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

/** Monthly-default price. `per` seeds the suffix so it reads correctly with JS
 *  off; the billing toggle swaps both amount and suffix via the data-* attrs. */
function Price({ m, y, per }: { m: number; y: number; per: string }) {
  return (
    <>
      <span className="amount" data-amount="" data-m={m} data-y={y}>
        €{m}
      </span>{" "}
      <span className="per" data-per="">
        {per}
      </span>
    </>
  );
}

function PlanCard({
  t,
  plan,
  href,
}: {
  t: Translator;
  plan: (typeof PLANS)[number];
  href: string;
}) {
  const { id, featured, m, y, avatar, hasRates } = plan;
  return (
    <article className={`plan${featured ? " plan--hot" : ""}`}>
      {featured && <span className="plan-flag">{t("t2Flag")}</span>}
      <div className="plan-head">
        <h3>{t(`${id}Name`)}</h3>
        <div className="plan-avatar">
          <img src={`/site/assets/${avatar}.png`} alt={t(`${id}Alt`)} />
        </div>
      </div>
      <p className="plan-tagline">{t(`${id}Tagline`)}</p>
      <div className="plan-price">
        <Price m={m} y={y} per={t("perMonthLabel")} />
      </div>
      <p className="plan-was" data-was="" data-m={m} />
      <p className="plan-usage only-dodi">{t("usageDodi")}</p>
      <p className="plan-usage only-byok">{t("usageByok")}</p>
      <a className={`btn ${featured ? "btn--primary" : "btn--ghost"}`} href={href}>
        {t(`${id}Cta`)}
      </a>
      <ul className="plan-feats">
        <Feat value={t(`${id}Kids`)} label={t("featKids")} />
        <Feat value={t(`${id}Personas`)} label={t("featPersonas")} />
        <Feat value={t(`${id}Memory`)} label={t("featMemory")} />
        <Feat value={t(`${id}Storage`)} label={t("featStorage")} />
        {hasRates && <Feat value={t(`${id}Rates`)} label={t("featRates")} dodiOnly />}
      </ul>
    </article>
  );
}

function Feat({
  value,
  label,
  dodiOnly,
}: {
  value: string;
  label: string;
  dodiOnly?: boolean;
}) {
  return (
    <li className={dodiOnly ? "only-dodi" : undefined}>
      <Check sw={2.6} />
      <span>
        <strong>{value}</strong> {label}
      </span>
    </li>
  );
}

/** Collapsible full rate table (dodi AI mode only). Sits directly beneath the
 *  usage calculator and shares its width. */
function RateCard({ t }: { t: Translator }) {
  return (
    <details className="ratecard only-dodi" id="rates">
      <summary>
        {t("ratecardSummary")}
        <Caret sw={2.2} />
      </summary>
      <div className="rt-scroll">
        <table className="rate-table">
          <thead>
            <tr>
              <th scope="col" />
              {PLANS.map((p) => (
                <th key={p.id} scope="col">
                  {t(`${p.id}Name`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="rt-group">
              <th colSpan={4}>{t("rtVoice")}</th>
            </tr>
            <tr>
              <th scope="row">{t("rtVoiceRow")}</th>
              {["0.09", "0.075", "0.066"].map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
            <tr className="rt-group">
              <th colSpan={4}>{t("rtText")}</th>
            </tr>
            {RATE_TEXT.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                {row.cells.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
            <tr className="rt-group">
              <th colSpan={4}>{t("rtImages")}</th>
            </tr>
            {RATE_IMG.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                {row.cells.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rate-notes">
        <p>{t("rtNote1")}</p>
        <p>{t("rtNote2")}</p>
      </div>
    </details>
  );
}

/** Live "how far does my balance go?" estimator (dodi AI mode only). Pick a
 *  model + plan + € balance; <LandingInteractions> computes game creations /
 *  edits (text models) or voice minutes. The markup ships a sensible default
 *  (Voice · Strider · €10) so it reads correctly with JS off. */
function UsageCalc({ t }: { t: Translator }) {
  return (
    <div
      className="usage-calc only-dodi"
      data-calc=""
      data-lbl-creations={t("calcUnitCreations")}
      data-lbl-edits={t("calcUnitEdits")}
      data-lbl-minutes={t("calcUnitMinutes")}
    >
      <div className="uc-head">
        <span className="eyebrow">
          <Sparkle /> {t("calcEyebrow")}
        </span>
        <h3>{t("calcTitle")}</h3>
        <p>{t("calcLead")}</p>
      </div>
      <div className="uc-controls">
        <div className="uc-field uc-field--balance">
          <label className="uc-label" htmlFor="uc-balance">
            {t("calcBalanceLabel")}
          </label>
          <div className="uc-balance">
            <span className="uc-cur">€</span>
            <input
              id="uc-balance"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              step={1}
              defaultValue={10}
              data-calc-balance
            />
          </div>
        </div>
        <UcSelect label={t("calcModelLabel")} labelId="uc-model-label" value={t("calcModelVoice")}>
          {CALC_MODELS.map((mdl) => {
            const text = mdl.label ?? t("calcModelVoice");
            return (
              <button
                key={mdl.id}
                type="button"
                role="option"
                data-calc-model={mdl.id}
                data-kind={mdl.kind}
                data-rate={"rate" in mdl ? mdl.rate : undefined}
                data-in={"input" in mdl ? mdl.input : undefined}
                data-out={"output" in mdl ? mdl.output : undefined}
                data-uc-text={text}
                aria-selected={mdl.id === "voice" ? "true" : "false"}
              >
                {text}
                <UcCheck />
              </button>
            );
          })}
        </UcSelect>
        <UcSelect label={t("calcPlanLabel")} labelId="uc-plan-label" value={t("t2Name")}>
          {PLANS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              data-calc-plan={i}
              data-uc-text={t(`${p.id}Name`)}
              aria-selected={i === 1 ? "true" : "false"}
            >
              {t(`${p.id}Name`)}
              <UcCheck />
            </button>
          ))}
        </UcSelect>
      </div>
      <div className="uc-result" data-calc-kind="voice">
        <div className="uc-stat">
          <span className="uc-num" data-calc-primary>
            133
          </span>
          <span className="uc-unit" data-calc-primary-label>
            {t("calcUnitMinutes")}
          </span>
        </div>
        <span className="uc-or">{t("calcOr")}</span>
        <div className="uc-stat uc-stat--alt">
          <span className="uc-num" data-calc-secondary>
            42
          </span>
          <span className="uc-unit" data-calc-secondary-label>
            {t("calcUnitEdits")}
          </span>
        </div>
      </div>
      <p className="uc-note">{t("calcNote")}</p>
    </div>
  );
}

/** A calculator dropdown styled like the header language selector. Options are
 *  passed as <button role="option"> children carrying the calc data-* attrs;
 *  <LandingInteractions> wires open/close, selection and the button label. */
function UcSelect({
  label,
  labelId,
  value,
  children,
}: {
  label: string;
  labelId: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="uc-field">
      <span className="uc-label" id={labelId}>
        {label}
      </span>
      <div className="uc-select" data-uc-select>
        <button
          type="button"
          className="ucs-btn"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-labelledby={labelId}
        >
          <span data-uc-value>{value}</span>
          <svg
            className="ucs-caret"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div className="ucs-menu" role="listbox" aria-label={label}>
          {children}
        </div>
      </div>
    </div>
  );
}

function UcCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Render a quote string, turning `**…**` markers into coral accent spans.
 *  Lets a quote carry several emphasised phrases from a single message key. */
function emphasize(text: string): ReactNode {
  return text
    .split("**")
    .map((seg, i) => (i % 2 === 1 ? <span key={i} className="accent">{seg}</span> : seg));
}

function Quote({ t, n, variant }: { t: Translator; n: string; variant?: "violet" }) {
  return (
    <figure className={`quote-card reveal${variant ? ` quote-card--${variant}` : ""}`}>
      <span className="q-mark" aria-hidden="true">
        &ldquo;
      </span>
      <blockquote>
        <p>{emphasize(t(`quote${n}Text`))}</p>
      </blockquote>
      <figcaption>
        <span className="q-avatar" aria-hidden="true">
          {t(`quote${n}Initials`)}
        </span>
        <span className="q-who">
          <span className="q-name">{t(`quote${n}Name`)}</span>
          <br />
          <span className="q-role">{t(`quote${n}Role`)}</span>
        </span>
      </figcaption>
    </figure>
  );
}

