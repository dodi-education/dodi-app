import { ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";
import { stageBody, studioFrame } from "@dodi/ui-recipes";

import { GameStage } from "@/components/games/game-stage";
import { cn } from "@/lib/cn";

import { CodeViewer } from "./code-viewer";
import { EmptyStage } from "./empty-stage";
import { SettingsForm } from "./settings-form";
import { StageHeader } from "./stage-header";
import type { GameStudioController } from "./use-game-studio";

/** The main stage (web: the studio's "Main stage" pane): preview, code, settings. */
export function StagePane({ studio }: { studio: GameStudioController }) {
  const t = useTranslations("gameStudio");
  const { game, view, versions } = studio;

  return (
    <View className={cn(studioFrame.main, !studio.panes.showMain && "hidden")}>
      {/* The Plan step's surfaces bring their own header; the switch returns after it. */}
      {!studio.isPlanMode ? (
        <StageHeader
          view={view}
          onViewChange={studio.setView}
          isPlanning={studio.isPlanning}
          showLocalePicker={studio.previewHasTranslations}
          previewLocale={studio.previewLocale}
          onPreviewLocaleChange={studio.setPreviewLocaleChoice}
          hasGame={Boolean(game.id)}
          isActive={game.isActive}
          isTogglingActive={studio.isTogglingActive}
          onToggleActive={studio.toggleActive}
        />
      ) : null}

      <View className={stageBody.box}>
        {/* The stage stays mounted whenever code exists (hidden on the other
            tabs) so the sandbox can serve edit-time screenshots without a reload. */}
        {game.codeBundle ? (
          <View
            accessibilityElementsHidden={view !== "preview"}
            importantForAccessibility={view !== "preview" ? "no-hide-descendants" : "auto"}
            pointerEvents={view !== "preview" ? "none" : "auto"}
            className={cn("flex-1", view !== "preview" && "absolute inset-0 -z-10 opacity-0")}
          >
            <ScrollView className="flex-1" contentContainerClassName={cn(stageBody.center, "flex-grow")}>
              <GameStage
                // Locale is fixed at init: remount on switch so the game re-renders its text.
                key={studio.previewLocale}
                gameId={game.id ?? "preview"}
                codeBundle={game.codeBundle}
                locale={studio.previewLocale}
                sandboxRef={studio.sandboxRef}
              />
            </ScrollView>
          </View>
        ) : null}
        {view === "preview" && !game.codeBundle ? (
          <ScrollView className="flex-1" contentContainerClassName={cn(stageBody.center, "flex-grow")}>
            <EmptyStage title={t("previewEmpty")} />
          </ScrollView>
        ) : null}
        {view === "code" ? (
          game.codeBundle ? (
            <CodeViewer
              code={game.codeBundle}
              previousCode={versions.previousCode}
              showChanges={studio.showChanges}
              onShowChangesChange={studio.setShowChanges}
              versions={versions.versionOptions}
              currentVersionId={game.currentGameVersionId}
              onSelectVersion={versions.selectVersion}
              busy={studio.isThinking || versions.isReverting}
              copyLabel={t("copy")}
              copiedLabel={t("copied")}
              showChangesLabel={t("showChanges")}
              showChangesUnavailableTitle={t("noPreviousVersion")}
              unchangedLabel={(count) => t("unchangedLines", { count })}
              versionSelectorLabel={t("versionSelector")}
            />
          ) : (
            <ScrollView className="flex-1" contentContainerClassName={cn(stageBody.centerCode, "flex-grow")}>
              <EmptyStage title={t("codeEmpty")} icon="code" />
            </ScrollView>
          )
        ) : null}
        {view === "settings" ? (
          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
            <SettingsForm
              game={game}
              kids={studio.kids}
              invalid={studio.invalid}
              setField={studio.setField}
              selectFamily={studio.selectFamily}
              toggleKid={studio.toggleKid}
              onSave={studio.saveSettings}
              saving={studio.isSaving}
              justSaved={studio.justSaved}
              error={studio.error}
              hasImageProvider={studio.hasImageProvider}
              isPlanning={studio.isPlanning}
              hasAcceptedPlan={Boolean(studio.acceptedPlan)}
              listingTranslations={studio.listingTranslations}
              listingSourceLocale={studio.listingSourceLocale}
            />
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}
