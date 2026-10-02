import { View } from "react-native";
import { studioFrame } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { ChatHeader } from "./chat-header";
import { ChatThread } from "./chat-thread";
import { Composer } from "./composer";
import { ComposerNotices } from "./composer-notices";
import { PlanActionRow, PlanEmptyActions } from "./plan-chat-actions";
import { PlanSketchSurface } from "./plan-sketch-surface";
import { PlanSurface } from "./plan-surface";
import { MAX_ATTACHMENTS, type GameStudioController } from "./use-game-studio";

/**
 * The dodi pane (web: the studio's chat sidebar, full width on a phone): the
 * header, the Plan step's controls, the thread (or a Plan surface over it)
 * and the composer.
 */
export function ChatPane({ studio }: { studio: GameStudioController }) {
  const { messages, isThinking, isMobileSurfaceOpen } = studio;

  const planSurface =
    studio.planSurface === "sketch" ? (
      <PlanSketchSurface
        strokes={studio.sketchStrokes}
        onStrokesChange={studio.setSketchStrokes}
        onChange={studio.onSketchChange}
        onAttach={studio.attachSketch}
        onBack={() => studio.setPlanSurface("chat")}
        isBusy={isThinking}
      />
    ) : studio.planSurface === "plan" ? (
      <PlanSurface
        onBack={() => studio.setPlanSurface("chat")}
        planDraft={studio.planDraft}
        isEditingPlan={studio.isEditingPlan}
        onPlanDraftChange={studio.setPlanDraft}
        onToggleEdit={studio.toggleEditPlan}
        onAccept={studio.acceptPlan}
        onSkip={studio.skipPlan}
        onPersonalize={studio.personalizePlan}
        isBusy={isThinking}
        isDerivingSettings={studio.isDerivingSettings}
      />
    ) : null;

  return (
    <View className={cn(studioFrame.chat, studioFrame.chatVertical, !studio.panes.showChat && "hidden")}>
      {/* On a phone an open Plan surface carries its own header instead. */}
      {!isMobileSurfaceOpen ? (
        <ChatHeader
          statusText={studio.statusText}
          isThinking={isThinking}
          canClear={!isThinking && messages.length > 0}
          onClear={() => studio.setIsClearOpen(true)}
        />
      ) : null}

      {studio.isPlanMode && !isMobileSurfaceOpen && messages.length > 0 ? (
        <PlanActionRow
          hasPlan={studio.hasPlan}
          activeSurface={studio.planSurface}
          compact
          onDrawSketch={studio.openSketchSurface}
          onTakePhoto={studio.openPlanCamera}
          onOpenPlan={() => studio.setPlanSurface("plan")}
          onSkip={studio.skipPlan}
          isBusy={isThinking}
          isDerivingSettings={studio.isDerivingSettings}
          needsGameProvider={studio.needsGameProvider}
        />
      ) : null}

      {/* A Plan surface takes the thread's place; the thread is hidden, not
          unmounted, so it comes back where the parent left it. */}
      {isMobileSurfaceOpen ? planSurface : null}

      <ChatThread
        isHidden={isMobileSurfaceOpen}
        messages={messages}
        isPlanMode={studio.isPlanMode}
        isMobilePlan={studio.isMobilePlan}
        needsGameProvider={studio.needsGameProvider}
        isThinking={isThinking}
        step={studio.step}
        narration={studio.narration}
        writeChars={studio.writeChars}
        liveRun={studio.liveRun}
        planActions={
          <PlanEmptyActions
            hasPlan={studio.hasPlan}
            onIdea={studio.sendPlanIdea}
            onDrawSketch={studio.openSketchSurface}
            onTakePhoto={studio.openPlanCamera}
            onOpenPlan={() => studio.setPlanSurface("plan")}
            onSkip={studio.skipPlan}
            isBusy={isThinking}
            isDerivingSettings={studio.isDerivingSettings}
            needsGameProvider={studio.needsGameProvider}
          />
        }
        onStarter={studio.sendStarter}
        linksIndex={studio.versions.canDiff || studio.versions.isReverted ? studio.lastChangeIndex : -1}
        onShowChanges={studio.openChanges}
        onRevert={() => void studio.versions.revertCode()}
        isReverted={studio.versions.isReverted}
        isRevertDisabled={studio.versions.isReverting || isThinking}
      />

      <Composer
        draft={studio.draft}
        onDraftChange={studio.setDraft}
        placeholder={studio.composerPlaceholder}
        isLocked={studio.isComposerLocked}
        isThinking={isThinking}
        isSurfaceOpen={isMobileSurfaceOpen}
        pendingImages={studio.pendingImages}
        onRemoveImage={studio.removePendingImage}
        isAttachDisabled={studio.isComposerLocked || studio.pendingImages.length >= MAX_ATTACHMENTS}
        onAttach={() => studio.setIsAttachSheetOpen(true)}
        onSend={studio.send}
        onStop={studio.stop}
        notices={
          <ComposerNotices
            needsGameProvider={studio.needsGameProvider}
            isThinking={isThinking}
            isBuildRunning={studio.activeBuild !== null}
            canResume={studio.resumable !== null}
            isOtherBuildRunning={studio.isOtherBuildRunning}
            onResume={studio.resumeBuild}
            onDiscardResumable={studio.discardResumableBuild}
            error={studio.error}
            bgNotice={studio.bgNotice}
            previewNotice={studio.previewNotice}
            hasVisualCheckNotice={studio.hasVisualCheckNotice}
          />
        }
      />
    </View>
  );
}
