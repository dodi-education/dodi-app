import { useTranslations } from "next-intl";

import { LoginDialogProvider } from "@/components/auth/login-dialog";
import { GameViewShell } from "@/components/games/game-view-shell";
import { CompanionIntroCard } from "@/components/public/companion-intro-card";
import { GameAboutCard } from "@/components/public/game-about-card";
import { PopularGamesCard } from "@/components/public/popular-games-card";
import { PublicActionButtons } from "@/components/public/public-action-buttons";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicGamePlay } from "@/components/public/public-game-play";
import { PublicHeader } from "@/components/public/public-header";
import { publicGamePath } from "@/lib/public-game-urls";
import { siteUrl } from "@/lib/site-links";
import {
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import { isEmptyCriteria } from "@dodi/games/success";
import type { GameGoal } from "@dodi/types/games";
import type { DiscoverGameDetail, PublicGameSummary } from "@dodi/types/games";

/**
 * The logged-out /games/[id] experience — the SEO inbound page. It renders
 * through the SAME GameViewShell as the signed-in view, with contextual slots
 * swapped: sign-in/about/popular cards instead of the Dodi panel, login-gated
 * action buttons instead of the live ones, and the marketing site as the back
 * target. The description lives in the about card, not the title bar, so the
 * back button, title and action buttons share one row.
 * Sharing the shell keeps the title bar, buttons and canvas pixel-aligned
 * across both states. Server rendered: title, description, popular rail and
 * JSON-LD are all in the HTML; only the sandbox and sign-in surfaces hydrate.
 */
export function PublicGamePage({
  game,
  popular,
  locale,
}: {
  game: DiscoverGameDetail;
  popular: PublicGameSummary[];
  locale: string;
}) {
  const tg = useTranslations("games");

  const successCriteria = coerceSuccessCriteria(game.success_criteria);
  const progressKind = coerceProgressKind(game.progress_kind);
  const goal: GameGoal | undefined =
    progressKind === "goal" && !isEmptyCriteria(successCriteria)
      ? {
          learningGoal: game.learning_goal,
          successDefinition: game.success_definition,
          successCriteria,
          progressKind,
        }
      : undefined;

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app"
  ).replace(/\/+$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["Game", "LearningResource"],
    name: game.title,
    description: game.description,
    url: `${appUrl}${publicGamePath(game.id, locale)}`,
    inLanguage: locale,
    typicalAgeRange: `${game.target_age_min}-${game.target_age_max}`,
    timeRequired: `PT${game.estimated_duration_minutes}M`,
    isAccessibleForFree: true,
    publisher: {
      "@type": "Organization",
      name: "dodi",
      url: siteUrl("home", locale),
    },
    ...(game.preview_image?.startsWith("/")
      ? { image: `${appUrl}${game.preview_image}` }
      : {}),
  };

  const cards = (
    <div className="flex flex-col gap-5">
      <CompanionIntroCard />
      <GameAboutCard game={game} />
      <PopularGamesCard games={popular} locale={locale} />
    </div>
  );

  return (
    <LoginDialogProvider next={`/games/${game.id}`}>
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex flex-1 flex-col px-4 pb-12 pt-6 font-kid">
          <div className="mx-auto w-full max-w-6xl">
            <GameViewShell
              backHref={siteUrl("games", locale)}
              backLabel={tg("title")}
              title={game.title}
              action={<PublicActionButtons />}
              sidebar={cards}
            >
              <PublicGamePlay
                gameId={game.id}
                codeBundle={game.code_bundle}
                goal={goal}
                locale={locale}
              />
              {/* Below lg the shell hides its sidebar — repeat the conversion
                  cards under the stage so mobile visitors still get them. */}
              <div className="mt-6 lg:hidden">{cards}</div>
            </GameViewShell>
          </div>
        </main>
        <PublicFooter locale={locale} />
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </LoginDialogProvider>
  );
}
