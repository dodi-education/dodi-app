"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { useLoginDialog } from "@/components/auth/login-dialog";
import { Icon, type IconName } from "@/components/shared/icon";
import { siteUrl } from "@/lib/site-links";

/**
 * The conversion card in the public game page's sidebar: dodi introduces
 * itself and lists what signing in unlocks. The sign-in link opens the shared
 * login dialog; registration links out to the full page.
 */
export function CompanionIntroCard() {
  const t = useTranslations("publicGames");
  const locale = useLocale();
  const { openLoginDialog } = useLoginDialog();

  const benefits: Array<{ icon: IconName; label: string }> = [
    { icon: "add", label: t("benefitCreate") },
    { icon: "camera", label: t("benefitSave") },
    { icon: "info", label: t("benefitHelp") },
  ];

  const linkClass =
    "font-bold text-primary transition-colors hover:text-primary-hover";

  return (
    <section className="rounded-[20px] bg-white p-[18px] shadow-card">
      <div className="flex items-center gap-3">
        <Image
          src="/images/dodi-active.png"
          alt=""
          width={56}
          height={56}
          className="size-14 shrink-0 object-contain"
        />
        <div className="min-w-0">
          <h2 className="font-kid text-lg font-extrabold text-ink">
            {t("introTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("introRole")}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm font-semibold leading-relaxed text-ink-2">
          {t.rich("introText", {
            login: (chunks) => (
              <button
                type="button"
                onClick={openLoginDialog}
                className={linkClass}
              >
                {chunks}
              </button>
            ),
            register: (chunks) => (
              <Link href="/register" className={linkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
        <ul className="mt-3.5 flex flex-col gap-2.5">
          {benefits.map((benefit) => (
            <li
              key={benefit.label}
              className="flex items-center gap-2.5 text-sm font-semibold text-ink-2"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon name={benefit.icon} size={15} stroke={2.5} />
              </span>
              {benefit.label}
            </li>
          ))}
        </ul>
        <a
          href={siteUrl("home", locale)}
          className={`mt-4 inline-flex items-center gap-1.5 text-sm ${linkClass}`}
        >
          <Icon name="arrow_left" size={15} stroke={2.5} />
          {t("learnMore")}
        </a>
      </div>
    </section>
  );
}
