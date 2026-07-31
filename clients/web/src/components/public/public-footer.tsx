import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { GITHUB_URL, siteUrl } from "@/lib/site-links";

/**
 * Tailwind port of the landing site's dark footer (dodi-com/landing
 * SiteFooter) for the public game page: same ink background, wordmark,
 * tagline, four link columns and the open-source/privacy badges. Links go to
 * the marketing site in the visitor's locale; the tag quick-links are landing
 * territory and stay there (their localized slugs live only in that repo).
 */
export function PublicFooter({ locale }: { locale: string }) {
  const t = useTranslations("publicGames");
  const year = new Date().getFullYear();

  const columns: Array<{
    heading: string;
    links: Array<{ label: string; href: string; external?: boolean }>;
  }> = [
    {
      heading: t("footerProduct"),
      links: [
        { label: t("footerApp"), href: siteUrl("app", locale) },
        { label: t("footerCompanion"), href: siteUrl("companion", locale) },
        { label: t("footerPricing"), href: siteUrl("pricing", locale) },
        { label: t("footerOpenApp"), href: "/" },
      ],
    },
    {
      heading: t("footerGames"),
      links: [{ label: t("footerAllGames"), href: siteUrl("games", locale) }],
    },
    {
      heading: t("footerCompany"),
      links: [
        { label: t("footerAbout"), href: siteUrl("about", locale) },
        { label: t("footerGithub"), href: GITHUB_URL, external: true },
      ],
    },
    {
      heading: t("footerHow"),
      links: [
        { label: t("footerMemory"), href: siteUrl("app", locale, "#memory") },
        { label: t("footerStudio"), href: siteUrl("app", locale, "#games") },
        {
          label: t("footerPrivacy"),
          href: siteUrl("companion", locale, "#privacy"),
        },
      ],
    },
  ];

  return (
    <footer className="mt-10 bg-ink-deep pb-9 pt-16 text-mist">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="sm:col-span-2 lg:col-span-1">
            <a href={siteUrl("home", locale)} aria-label="dodi">
              <Image
                src="/images/dodi-wordmark-white.svg"
                alt="dodi"
                width={92}
                height={28}
                className="h-7 w-auto"
              />
            </a>
            <p className="mt-4 max-w-xs text-[0.98rem] leading-relaxed text-mist-2">
              {t("footerTagline")}
            </p>
          </div>
          {columns.map((column) => (
            <div key={column.heading}>
              <h5 className="mb-3.5 font-kid text-[0.95rem] font-extrabold tracking-wide text-white">
                {column.heading}
              </h5>
              {column.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  {...(link.external
                    ? { target: "_blank", rel: "noopener" }
                    : {})}
                  className="block py-1.5 text-[0.97rem] text-mist transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3.5 border-t border-white/10 pt-6 text-sm text-mist-3">
          <span>{t("footerCopyright", { year })}</span>
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Icon name="code" size={16} stroke={2} />
              {t("footerOpenSource")}
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="feature_privacy" size={16} stroke={2} />
              {t("footerPrivacyFirst")}
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
