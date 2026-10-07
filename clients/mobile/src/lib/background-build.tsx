/**
 * Keeps the device's Game Studio build alive while the parent uses other apps
 * (the mobile app's differentiator). It follows the build store and drives the
 * native `background-build` module:
 *
 * - a build starts: ask the OS to protect it (iOS 26 continued processing,
 *   iOS 17–25 a short background task, Android a foreground service);
 * - a step changes: update the system progress UI;
 * - the OS runs out of time: pause at the checkpoint, and continue
 *   automatically once the app is active again;
 * - a build ends while the app is in the background: post a local
 *   notification that opens the game's studio.
 */
import * as Notifications from "expo-notifications";
import { type Href, router } from "expo-router";
import { type ReactNode, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useTranslations } from "use-intl";
import type { StudioBuildOutcome, StudioBuildTexts } from "@dodi/studio/build-runner";
import type { AgentStep } from "@dodi/types/agent-progress";

import { type BackgroundWorkHold, holdBackgroundWork } from "./background-work";
import { studioBuildStore } from "./studio-build-store";

const RESULT_CHANNEL = "dodi-build-results";

/** Rough share of a build each step marks; the bar never moves backwards. */
const STEP_PROGRESS: Record<AgentStep, number> = {
  thinking: 0.1,
  reading_docs: 0.15,
  generating_image: 0.25,
  writing_code: 0.4,
  validating: 0.65,
  fixing_validation: 0.7,
  visual_check: 0.8,
  generating_preview: 0.9,
  finalizing: 0.95,
};

const STEP_LABEL_KEYS: Record<AgentStep, string> = {
  thinking: "stepThinking",
  reading_docs: "stepReadingDocs",
  generating_image: "stepGeneratingImage",
  generating_preview: "stepGeneratingPreview",
  writing_code: "stepWritingCode",
  validating: "stepValidating",
  fixing_validation: "stepFixingValidation",
  visual_check: "stepVisualCheck",
  finalizing: "stepFinalizing",
};

Notifications.setNotificationHandler({
  // A build that ends while the app is open shows its result in the studio.
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function studioHref(gameId: string): Href {
  return `/parent/game-studio/${gameId}` as Href;
}

function openFromNotification(response: Notifications.NotificationResponse | null): void {
  const gameId = response?.notification.request.content.data?.gameId;
  if (typeof gameId === "string") router.push(studioHref(gameId));
}

/**
 * Asked when a build starts: the parent is in the app then, and a prompt can't
 * appear once it runs in the background. Android 13+ also needs it to show the
 * foreground service's progress notification.
 */
async function askToNotify(): Promise<void> {
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
}

/** Mounted once, inside the locale provider (the notifications are translated). */
export function BackgroundBuildBridge(): ReactNode {
  const t = useTranslations("backgroundBuild");
  const tStudio = useTranslations("gameStudio");
  // Read inside store callbacks without re-subscribing on every render.
  const textsRef = useRef({ t, tStudio });
  useEffect(() => {
    textsRef.current = { t, tStudio };
  }, [t, tStudio]);

  useEffect(() => {
    const texts = (): StudioBuildTexts => {
      const s = textsRef.current.tStudio;
      return {
        buildSummaryTitle: s("buildSummaryTitle"),
        stopped: s("stopped"),
        paused: s("buildPaused"),
        buildFailed: s("buildFailed"),
        aiUnavailable: s("aiUnavailable"),
        previewUpdated: s("previewUpdatedMessage"),
        previewUpdateFailed: s("previewUpdateFailedMessage"),
      };
    };
    const stepLabel = (step: AgentStep | null): string =>
      step ? textsRef.current.tStudio(STEP_LABEL_KEYS[step]) : textsRef.current.tStudio("building");

    // Builds the OS paused; they continue once the app is active again.
    const pausedGameIds = new Set<string>();
    let progress = 0;
    let isExpiring = false;
    let hold: BackgroundWorkHold | null = null;

    const notify = async (gameId: string, outcome: StudioBuildOutcome): Promise<void> => {
      if (AppState.currentState === "active") return;
      if (!(await Notifications.getPermissionsAsync()).granted) return;
      const { t: tb } = textsRef.current;
      const [title, body] =
        outcome.kind === "built" || outcome.kind === "preview_only"
          ? [tb("readyTitle"), tb("readyBody")]
          : outcome.kind === "paused"
            ? [tb("pausedTitle"), tb("pausedBody")]
            : [tb("failedTitle"), tb("failedBody")];
      await Notifications.scheduleNotificationAsync({
        content: { title, body, data: { gameId } },
        trigger: Platform.OS === "android" ? { channelId: RESULT_CHANNEL } : null,
      });
    };

    const unsubscribe = studioBuildStore.store.subscribe((state, previous) => {
      const active = state.active;
      const before = previous.active;
      if (active && !before) {
        progress = 0;
        isExpiring = false;
        pausedGameIds.delete(active.gameId);
        void askToNotify().catch(() => {});
        hold?.release(false);
        // The OS ran out of time: pause at the checkpoint; it resumes once the
        // app is active again.
        hold = holdBackgroundWork(
          "build",
          { title: textsRef.current.t("title"), subtitle: stepLabel(active.step) },
          () => {
            isExpiring = true;
            studioBuildStore.pause();
          },
        );
      } else if (active && before && active.step !== before.step && active.step) {
        progress = Math.max(progress, STEP_PROGRESS[active.step]);
        hold?.update(progress, stepLabel(active.step));
      } else if (!active && before) {
        const outcome = state.outcomes[before.gameId];
        hold?.release(outcome?.kind === "built" || outcome?.kind === "preview_only");
        hold = null;
        if (!outcome) return;
        if (outcome.kind === "paused" && isExpiring) pausedGameIds.add(before.gameId);
        if (outcome.kind !== "stopped") void notify(before.gameId, outcome).catch(() => {});
      }
    });

    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      for (const gameId of pausedGameIds) {
        pausedGameIds.delete(gameId);
        // The studio takes the paused outcome when it is open; either way the
        // build continues from its checkpoint.
        studioBuildStore.takeOutcome(gameId);
        void studioBuildStore.resume(gameId, texts());
        break;
      }
    });

    if (Platform.OS === "android") {
      void Notifications.setNotificationChannelAsync(RESULT_CHANNEL, {
        name: textsRef.current.t("channelName"),
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    openFromNotification(Notifications.getLastNotificationResponse());
    const responses = Notifications.addNotificationResponseReceivedListener(openFromNotification);

    return () => {
      unsubscribe();
      hold?.release(false);
      appState.remove();
      responses.remove();
    };
  }, []);

  return null;
}
