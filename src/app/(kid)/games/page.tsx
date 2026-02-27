import { getTranslations } from "next-intl/server";

export default async function GamesPage() {
  const t = await getTranslations("kid");

  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      <h1 className="text-2xl font-bold text-dodi-800">{t("gamesTitle")}</h1>
      <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-dodi-200 bg-white p-8 text-center">
        <p className="text-4xl">🎮</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("gamesPlaceholder")}
        </p>
      </div>
    </div>
  );
}
