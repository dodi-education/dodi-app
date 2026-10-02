import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import type { StudioGame, StudioView } from "@dodi/studio/studio-game";
import { PARENT_TOP_BAR_HEIGHT, studioFrame } from "@dodi/ui-recipes";

import { Button, Dialog } from "@/components/ui";
import { cn } from "@/lib/cn";

import { ChatPane } from "./chat-pane";
import { ReferenceImageSheet } from "./reference-image-sheet";
import { StagePane } from "./stage-pane";
import { StudioTab, StudioTabBar } from "./studio-tabs";
import { useGameStudio } from "./use-game-studio";

interface GameStudioProps {
  initialGame?: StudioGame;
  /** Tab from the route; falls back to preview for a saved game, settings for a draft. */
  initialView?: StudioView;
}

/**
 * The Game Studio as the web renders it on a phone (web: GameStudio, the
 * `vertical` layout): a layer under the shell's top bar with the Game / dodi
 * switch, the stage (preview, code, settings) and the dodi pane (Plan step,
 * thread, composer). Builds run in the device's build store, not here.
 */
export function GameStudio({ initialGame, initialView }: GameStudioProps) {
  const t = useTranslations("gameStudio");
  const insets = useSafeAreaInsets();
  const studio = useGameStudio({ initialGame, initialView });

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      // The studio sits under the shell's top bar: the keyboard overlap is measured from the screen top.
      keyboardVerticalOffset={PARENT_TOP_BAR_HEIGHT + insets.top}
    >
      <View className={cn(studioFrame.root, "flex-1")} style={{ paddingBottom: insets.bottom }}>
        {/* The Game / dodi switch (hidden while the dodi pane is gated away, and
            during the Plan step, which owns the whole screen). */}
        {studio.panes.showTabBar ? (
          <StudioTabBar>
            <StudioTab
              isActive={studio.mtab === "game"}
              onPress={() => studio.setMtab("game")}
              icon="show"
              label={t("tabGame")}
            />
            <StudioTab
              isActive={studio.mtab === "chat"}
              onPress={() => studio.setMtab("chat")}
              icon="sparkles"
              label={t("tabDodi")}
            />
          </StudioTabBar>
        ) : null}

        <View className={cn(studioFrame.panes, studioFrame.panesVertical)}>
          <StagePane studio={studio} />
          <ChatPane studio={studio} />
        </View>

        {/* The composer's image button: camera, photo library, or (while planning) a sketch. */}
        <ReferenceImageSheet
          isOpen={studio.isAttachSheetOpen}
          onClose={() => studio.setIsAttachSheetOpen(false)}
          onTakePhoto={studio.openCamera}
          onUpload={studio.addImages}
          onDraw={studio.isPlanMode ? studio.openSketchSurface : undefined}
        />

        {/* Destructive confirm for clearing the conversation history. */}
        <Dialog
          isOpen={studio.isClearOpen}
          onClose={() => studio.setIsClearOpen(false)}
          title={t("clearHistoryConfirmTitle")}
          description={t("clearHistoryConfirmDescription")}
          footer={
            <>
              <Button variant="destructive" onPress={studio.clearHistory}>
                {t("clearHistoryConfirmButton")}
              </Button>
              <Button variant="outline" onPress={() => studio.setIsClearOpen(false)}>
                {t("clearHistoryCancel")}
              </Button>
            </>
          }
        />
      </View>
    </KeyboardAvoidingView>
  );
}
