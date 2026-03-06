import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Icon, type IconName } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Image
            src="/images/dodi-head.png"
            alt="Dodi"
            width={40}
            height={40}
          />
          <span className="text-xl font-bold text-dodi-800">Dodi</span>
        </div>
        <nav className="flex items-center gap-3">
          <LanguageSwitcher />
          <Button variant="ghost" asChild>
            <Link href="/login">{t("logIn")}</Link>
          </Button>
          <Button asChild>
            <Link href="/register">{tc("signUp")}</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center px-6">
        <section className="flex w-full max-w-5xl flex-col items-center gap-8 py-16 md:py-24">
          <div className="relative h-48 w-48 md:h-64 md:w-64">
            <Image
              src="/images/dodi-full.png"
              alt="Dodi — your AI learning companion"
              fill
              className="object-contain"
              priority
            />
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-dodi-900 md:text-6xl">
              {t("heroTitle")}
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
              {t("heroSubtitle")}
            </p>
            <div className="flex gap-3 pt-4">
              <Button size="lg" asChild>
                <Link href="/register">{t("getStarted")}</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">{t("haveAccount")}</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="w-full max-w-5xl py-16">
          <h2 className="mb-12 text-center text-2xl font-bold text-dodi-800 md:text-3xl">
            {t("featuresTitle")}
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon="feature_smart"
              title={t("featureSmartTitle")}
              description={t("featureSmartDesc")}
            />
            <FeatureCard
              icon="feature_games"
              title={t("featureGamesTitle")}
              description={t("featureGamesDesc")}
            />
            <FeatureCard
              icon="feature_privacy"
              title={t("featurePrivacyTitle")}
              description={t("featurePrivacyDesc")}
            />
            <FeatureCard
              icon="feature_personal"
              title={t("featurePersonalTitle")}
              description={t("featurePersonalDesc")}
            />
          </div>
        </section>

        {/* How it works */}
        <section className="w-full max-w-3xl py-16">
          <h2 className="mb-12 text-center text-2xl font-bold text-dodi-800 md:text-3xl">
            {t("howItWorksTitle")}
          </h2>
          <div className="flex flex-col gap-8">
            <Step
              number={1}
              title={t("step1Title")}
              description={t("step1Desc")}
            />
            <Step
              number={2}
              title={t("step2Title")}
              description={t("step2Desc")}
            />
            <Step
              number={3}
              title={t("step3Title")}
              description={t("step3Desc")}
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} {t("footer")}</p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 text-card-foreground">
      <Icon name={icon} className="mb-3 h-8 w-8 text-dodi-700" />
      <h3 className="mb-2 font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {number}
      </div>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
