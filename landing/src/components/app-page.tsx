import { LandingInteractions } from "@/components/landing-interactions";
import { buildLinks, createT, SiteFooter, SiteHeader } from "@/components/site/chrome";
import {
  Caret,
  Check,
  Gamepad,
  Home,
  SendUp,
  Smiley,
  SmileyHappy,
  Sparkle,
  Users,
} from "@/components/site/icons";
import type { Locale } from "@/lib/site";

/**
 * The App feature page, ported from the design's platform.html. Server
 * component; strings come from the "app" namespace (shared nav/footer/CTA
 * labels from "landing"). Reuses site.css + mocks.css and the shared chrome.
 */
export function AppPage({ locale }: { locale: Locale }) {
  const links = buildLinks(locale);
  const t = createT(locale, "app");
  const tl = createT(locale, "landing");
  return (
    <>
      <SiteHeader locale={locale} links={links} active="app" />
      <main>
        <section className="page-hero">
          <div className="wrap device-hero-grid">
            <div className="reveal">
              <span className="avail-badge now">
                <Check sw={2.4} /> {t("availNow")}
              </span>
              <h1 style={{ marginTop: 18 }}>{t("heroTitle")}</h1>
              <p className="lead">{t("heroLead")}</p>
              <div className="hero-cta">
                <a className="btn btn--primary btn--lg" href={links.app}>
                  {tl("nav.openApp")}
                </a>
                <a className="btn btn--ghost btn--lg" href="#memory">
                  {t("tourFeatures")}
                </a>
              </div>
            </div>
            <div className="hero-media reveal d1">
              <div className="hero-blob b1" />
              <div className="hero-photo">
                <img src="/site/assets/platform-shot.jpg" alt="A child talking to dodi on a tablet" />
              </div>
            </div>
          </div>
        </section>

        <div className="wrap">
          {/* 1 · Voice-first */}
          <div className="feature-row">
            <div className="fr-copy reveal">
              <span className="eyebrow">{t("f1Eyebrow")}</span>
              <h3>{t("f1Title")}</h3>
              <p>{t("f1Body")}</p>
              <ul className="fr-list">
                <FrItem bold={t("f1aBold")} rest={t("f1aRest")} />
                <FrItem bold={t("f1bBold")} rest={t("f1bRest")} />
                <FrItem bold={t("f1cBold")} rest={t("f1cRest")} />
              </ul>
            </div>
            <div className="fr-visual reveal d1">
              <div className="fr-visual-inner">
                <div className="mk-voice">
                  <div className="v-top">
                    <span className="v-chip">
                      <span className="av">N</span> Nora
                    </span>
                    <span className="v-parents">{t("mkParents")}</span>
                  </div>
                  <img className="v-mascot mascot-bob" src="/site/assets/dodi-mascot.png" alt="" />
                  <div className="mk-bubble">{t("mkListening")}</div>
                  <div className="v-nav">
                    <span className="vn on">
                      <Home sw={1.9} /> {t("mkHome")}
                    </span>
                    <span className="vn">
                      <Gamepad /> {t("mkGames")}
                    </span>
                    <span className="vn">
                      <Users /> {t("mkFriends")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2 · Memory */}
          <div className="feature-row flip" id="memory">
            <div className="fr-copy reveal">
              <span className="eyebrow">{t("f2Eyebrow")}</span>
              <h3>{t("f2Title")}</h3>
              <p>{t("f2Body")}</p>
              <ul className="fr-list">
                <FrItem bold={t("f2aBold")} rest={t("f2aRest")} />
                <FrItem bold={t("f2bBold")} rest={t("f2bRest")} />
                <FrItem bold={t("f2cBold")} rest={t("f2cRest")} />
              </ul>
            </div>
            <div className="fr-visual reveal d1">
              <div className="fr-visual-inner halo">
                <div className="mk-frame">
                  <MkBar label={t("memLabel")} />
                  <div className="mk-body mk-mem">
                    <div className="mk-h">{t("memHeading")}</div>
                    <div className="mk-memline">
                      <Smiley /> <span>{t("mem1")}</span>
                    </div>
                    <div className="mk-memline">
                      <Check sw={2.2} /> <span>{t("mem2")}</span>
                    </div>
                    <div className="mk-memline">
                      <SmileyHappy /> <span>{t("mem3")}</span>
                    </div>
                    <div className="mk-updated">
                      <span className="d" /> {t("memUpdated")}
                    </div>
                    <div className="mk-note" style={{ marginTop: 16 }}>
                      <span className="nlabel">{t("memNoteLabel")}</span>
                      {t("memNote")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3 · Game studio */}
          <div className="feature-row" id="games">
            <div className="fr-copy reveal">
              <span className="eyebrow coral">{t("f3Eyebrow")}</span>
              <h3>{t("f3Title")}</h3>
              <p>{t("f3Body")}</p>
              <ul className="fr-list">
                <FrItem bold={t("f3aBold")} rest={t("f3aRest")} />
                <FrItem bold={t("f3bBold")} rest={t("f3bRest")} />
                <FrItem bold={t("f3cBold")} rest={t("f3cRest")} />
              </ul>
            </div>
            <div className="fr-visual reveal d1">
              <div className="fr-visual-inner halo">
                <div className="mk-frame gs-demo" id="gs-demo">
                  <MkBar label={t("gsLabel")} />
                  <div className="mk-body">
                    {/* 1 · parent types a wish */}
                    <div className="mk-composer gs-input">
                      <span className="gs-typed">
                        <span className="gs-text" data-type-text={t("gsWish")} />
                        <span className="gs-caret" />
                      </span>
                      <span className="mk-send">
                        <SendUp />
                      </span>
                    </div>
                    {/* 2 · dodi thinks (agent mode) */}
                    <div className="gs-agent">
                      <img src="/site/assets/dodi-head.png" alt="" />
                      <div className="gs-agent-body">
                        <div className="gs-agent-name">
                          dodi <span className="gs-badge">{t("gsThinking")}</span>
                        </div>
                        <div className="gs-agent-text" data-think-text={t("gsThink")} />
                      </div>
                    </div>
                    {/* 3 · the game appears */}
                    <div className="gs-game">
                      <div className="gs-game-head">
                        <span className="gs-game-title">{t("gsGameTitle")}</span>
                        <span className="gs-game-q">{t("gsGameQ")}</span>
                      </div>
                      <div className="gs-dinos" aria-hidden="true">
                        <span className="gs-dino">🦖</span>
                        <span className="gs-dino">🦖</span>
                        <span className="gs-dino">🦖</span>
                        <span className="gs-dino">🦖</span>
                      </div>
                      <div className="gs-answers" aria-hidden="true">
                        <span>3</span>
                        <span className="hit">4</span>
                        <span>5</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 · Personas */}
          <div className="feature-row flip">
            <div className="fr-copy reveal">
              <span className="eyebrow" style={{ color: "var(--violet)" }}>
                {t("f4Eyebrow")}
              </span>
              <h3>{t("f4Title")}</h3>
              <p>{t("f4Body")}</p>
              <ul className="fr-list">
                <FrItem bold={t("f4aBold")} rest={t("f4aRest")} />
                <FrItem bold={t("f4bBold")} rest={t("f4bRest")} />
                <FrItem bold={t("f4cBold")} rest={t("f4cRest")} />
              </ul>
            </div>
            <div className="fr-visual reveal d1">
              <div className="fr-visual-inner halo">
                <div className="mk-frame">
                  <MkBar label="professor-dodi.md" mono />
                  <div className="mk-body">
                    <div className="mk-h" style={{ marginBottom: 12 }}>
                      {t("soulHeading")}
                    </div>
                    <div className="mk-soul">
                      <div className="sh">{t("soulName")}</div>
                      <div className="sh" style={{ marginTop: 8 }}>
                        {t("soulPersonality")}
                      </div>
                      <div className="sd">{t("soulP1")}</div>
                      <div className="sd">{t("soulP2")}</div>
                      <div className="sh" style={{ marginTop: 8 }}>
                        {t("soulApproach")}
                      </div>
                      <div className="sd">{t("soulA1")}</div>
                      <div className="sh" style={{ marginTop: 8 }}>
                        {t("soulBoundaries")}
                      </div>
                      <div className="sd">{t("soulB1")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5 · BYO AI */}
          <div className="feature-row" id="ai">
            <div className="fr-copy reveal">
              <span className="eyebrow mint">{t("f5Eyebrow")}</span>
              <h3>{t("f5Title")}</h3>
              <p>{t("f5Body")}</p>
              <ul className="fr-list">
                <FrItem bold={t("f5aBold")} rest={t("f5aRest")} />
                <FrItem bold={t("f5bBold")} rest={t("f5bRest")} />
                <FrItem bold={t("f5cBold")} rest={t("f5cRest")} />
              </ul>
            </div>
            <div className="fr-visual reveal d1">
              <div className="fr-visual-inner halo">
                <div className="mk-frame">
                  <MkBar label={t("aiLabel")} />
                  <div className="mk-body">
                    <div className="mk-h" style={{ marginBottom: 14 }}>
                      {t("aiHeading")}
                    </div>
                    <div className="mk-key">
                      <span className="kic">
                        <Sparkle sw={1.7} />
                      </span>
                      <div>
                        <div className="kname">
                          Google Gemini <span className="mk-keybadge">…OLCI</span>
                        </div>
                        <div className="kmeta">{t("aiGeminiMeta")}</div>
                      </div>
                      <span className="mk-connected">
                        <span className="d" /> {t("connected")}
                      </span>
                    </div>
                    <div className="mk-key">
                      <span className="kic">
                        <Smiley sw={1.7} />
                      </span>
                      <div>
                        <div className="kname">
                          Anthropic Claude <span className="mk-keybadge">…IQAA</span>
                        </div>
                        <div className="kmeta">{t("aiClaudeMeta")}</div>
                      </div>
                      <span className="mk-connected">
                        <span className="d" /> {t("connected")}
                      </span>
                    </div>
                    <div className="mk-field-label" style={{ marginTop: 16 }}>
                      {t("voiceLabel")}
                    </div>
                    <div className="mk-select">
                      <span>Gemini Flash Live · &quot;Leda&quot;</span>
                      <Caret />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 6 · Friends */}
          <div className="feature-row flip" id="friends">
            <div className="fr-copy reveal">
              <span className="eyebrow">{t("f6Eyebrow")}</span>
              <h3>{t("f6Title")}</h3>
              <p>{t("f6Body")}</p>
              <ul className="fr-list">
                <FrItem bold={t("f6aBold")} rest={t("f6aRest")} />
                <FrItem bold={t("f6bBold")} rest={t("f6bRest")} />
                <FrItem bold={t("f6cBold")} rest={t("f6cRest")} />
              </ul>
            </div>
            <div className="fr-visual reveal d1">
              <div className="fr-visual-inner halo">
                <div className="mk-frame fs-demo" id="fs-demo">
                  <MkBar label={t("frLabel")} />
                  <div className="mk-body">
                    <div className="fs-stage">
                      {/* 1 · Nora's friend code as a QR card */}
                      <div className="fs-qr">
                        <div className="mk-h">{t("frQrHeading")}</div>
                        <MockQr />
                        <div className="fs-code">AX7Q2F</div>
                        <div className="fs-hint">{t("frQrHint")}</div>
                      </div>
                      {/* 2 · …which turns into the friend list */}
                      <div className="fs-list">
                        <div className="mk-h">{t("frListHeading")}</div>
                        <FriendRow
                          initial="B"
                          bg="var(--mint-soft)"
                          color="var(--mint)"
                          name="Ben"
                          meta={t("frBenMeta")}
                          status="ok"
                          statusLabel={t("frFriends")}
                        />
                        <FriendRow
                          initial="A"
                          bg="var(--amber-soft)"
                          color="var(--amber)"
                          name="Ayla"
                          meta={t("frAylaMeta")}
                          status="wait"
                          statusLabel={t("frAwaiting")}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Companion teaser */}
        <section className="section band-deep">
          <div className="wrap" style={{ textAlign: "center" }}>
            <div className="reveal" style={{ maxWidth: 680, margin: "0 auto" }}>
              <span className="eyebrow on-dark">{t("teaserEyebrow")}</span>
              <h2 style={{ marginTop: 14 }}>{t("teaserTitle")}</h2>
              <p className="lead" style={{ marginTop: 16 }}>
                {t("teaserBody")}
              </p>
              <div className="hero-cta" style={{ justifyContent: "center", marginTop: 28 }}>
                <a className="btn btn--on-dark btn--lg" href={links.companion}>
                  {t("meetCompanion")}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="section cta-final">
          <div className="wrap wrap--narrow reveal">
            <img className="cta-mascot mascot-bob" src="/site/assets/dodi-mascot.png" alt="" />
            <h2>{t("ctaTitle")}</h2>
            <p className="lead">{t("ctaLead")}</p>
            <div className="hero-cta">
              <a className="btn btn--primary btn--lg" href={links.app}>
                {tl("nav.openApp")}
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

function FrItem({ bold, rest }: { bold: string; rest: string }) {
  return (
    <li>
      <Check sw={2.4} />
      <span>
        <b>{bold}</b>
        {rest}
      </span>
    </li>
  );
}

function MkBar({ label, mono }: { label: string; mono?: boolean }) {
  return (
    <div className="mk-bar">
      <span className="mk-dot r" />
      <span className="mk-dot y" />
      <span className="mk-dot g" />
      <span className={mono ? "mk-label mono" : "mk-label"}>{label}</span>
    </div>
  );
}

function FriendRow({
  initial,
  bg,
  color,
  name,
  meta,
  status,
  statusLabel,
}: {
  initial: string;
  bg: string;
  color: string;
  name: string;
  meta: string;
  status: "ok" | "wait";
  statusLabel: string;
}) {
  return (
    <div className="mk-profile fs-friend">
      <span className="mk-pava" style={{ background: bg, color }}>
        {initial}
      </span>
      <div>
        <div className="pn">{name}</div>
        <div className="pa">{meta}</div>
      </div>
      <span className={`fs-status ${status}`}>
        {status === "ok" ? <Check sw={2.6} /> : <span className="d" />}
        {statusLabel}
      </span>
    </div>
  );
}

/**
 * Decorative stand-in for a friend-code QR card: real finder/timing patterns
 * plus seeded pseudo-random data modules (deterministic, so the server render
 * is stable), with a blank centre window for the dodi head.
 */
const QR_N = 21;

function buildQrModules(): boolean[][] {
  const m: boolean[][] = Array.from({ length: QR_N }, () => Array<boolean>(QR_N).fill(false));
  const finder = (r: number, c: number) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const ring = y === 0 || y === 6 || x === 0 || x === 6;
        const core = y >= 2 && y <= 4 && x >= 2 && x <= 4;
        m[r + y][c + x] = ring || core;
      }
  };
  finder(0, 0);
  finder(0, QR_N - 7);
  finder(QR_N - 7, 0);
  for (let i = 8; i < QR_N - 8; i++) {
    m[6][i] = i % 2 === 0;
    m[i][6] = i % 2 === 0;
  }
  const isReserved = (r: number, c: number) =>
    (r < 8 && (c < 8 || c >= QR_N - 8)) ||
    (r >= QR_N - 8 && c < 8) ||
    r === 6 ||
    c === 6 ||
    (r >= 8 && r <= 12 && c >= 8 && c <= 12); // centre window for the mascot
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let r = 0; r < QR_N; r++)
    for (let c = 0; c < QR_N; c++) if (!isReserved(r, c)) m[r][c] = rnd() < 0.46;
  return m;
}

const QR_MODULES = buildQrModules();

function MockQr() {
  return (
    <div className="fs-qr-code" aria-hidden="true">
      <svg viewBox={`0 0 ${QR_N} ${QR_N}`} shapeRendering="crispEdges">
        {QR_MODULES.flatMap((row, y) =>
          row.map((on, x) =>
            on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null,
          ),
        )}
      </svg>
      <img src="/site/assets/dodi-head.png" alt="" />
      <span className="fs-scanline" />
    </div>
  );
}
