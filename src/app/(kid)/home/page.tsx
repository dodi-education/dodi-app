import Image from "next/image";
import { getTranslations } from "next-intl/server";

export default async function KidHomePage() {
  const t = await getTranslations("kid");

  return (
    <div className="flex flex-col items-center gap-8 pt-8">
      {/* Dodi avatar placeholder — will be replaced with Lottie animation in Phase 2 */}
      <div className="relative h-48 w-48">
        <Image
          src="/images/dodi-full.png"
          alt="Dodi"
          fill
          className="object-contain"
          priority
        />
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-dodi-800">{t("greeting")}</h1>
        <p className="mt-2 text-dodi-600">
          {t("introMessage")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("chatPlaceholder")}
        </p>
      </div>

      {/* Chat placeholder */}
      <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-dodi-200 bg-white p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t("dodiChatPlaceholder")}
        </p>
      </div>
    </div>
  );
}
