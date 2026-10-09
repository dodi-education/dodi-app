"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { DodiFigure } from "@/components/dodi/dodi-figure";
import { SpeechBubble } from "@/components/dodi/speech-bubble";
import { ListeningPulse } from "@/components/kid/listening-pulse";
import { Playground } from "@/components/kid/playground/playground";
import { companionErrorKind } from "@dodi/client-state/companion-error";
import { playground } from "@dodi/ui-recipes";
import { cn } from "@/lib/utils";
import { useCompanionStageStore } from "@/stores/companion-stage-store";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { useDodiContext } from "@/hooks/use-dodi-context";
import { useKids } from "@/hooks/use-kids";
import { useOnline } from "@/hooks/use-online";

interface DodiFullHomeProps {
  kidId: string;
  hasProvider: boolean;
}

/**
 * Shared stage wrapper: vertically centered column with mascot sizing. It
 * fills the page, which is where the 3D character can be turned and zoomed
 * (`data-character-area`, see lib/character/character-gestures.ts). It also
 * holds the Playground; while that is open only the character stays (the
 * speech bubble and hints step aside for the tools).
 */
function Stage({ children }: { children: React.ReactNode }) {
  const isPlaygroundOpen = useCompanionStageStore((s) => s.isPlaygroundOpen);
  return (
    <div data-character-area className="relative flex w-full flex-1 flex-col items-center">
      {/* Open on a phone, the character takes the top half above the panel. */}
      <div
        className={cn(
          "my-auto flex flex-col items-center gap-5 py-4",
          isPlaygroundOpen && "[&>*:not(:first-child)]:hidden",
          isPlaygroundOpen && playground.webStageOpen,
        )}
      >
        {children}
      </div>
      <Playground />
    </div>
  );
}

function MascotWrap({
  listening,
  children,
}: {
  listening?: boolean;
  children: React.ReactNode;
}) {
  // The figure is 76% of this box: 300px on desktop (395px box), unless the
  // window is too short for it. With the Playground open on a phone it fits
  // the top half of the screen.
  const isPlaygroundOpen = useCompanionStageStore((s) => s.isPlaygroundOpen);
  return (
    <div
      className={cn(
        "relative flex aspect-square w-[clamp(170px,38vh,300px)] items-center justify-center md:w-[min(395px,55vh)]",
        isPlaygroundOpen && "max-md:w-[min(300px,28dvh)]",
      )}
    >
      {listening ? <ListeningPulse /> : null}
      {children}
    </div>
  );
}

export function DodiFullHome({
  kidId,
  hasProvider,
}: DodiFullHomeProps) {
  const t = useTranslations("kid");
  const tVoice = useTranslations("games");

  const { kids } = useKids();
  const kidName =
    kids?.find((p) => p.id === kidId)?.display_name ?? "";

  useDodiContext({
    context: { type: "home" },
    displayMode: "full",
    kidId,
  });

  const dodiState = useDodiSessionStore((s) => s.state);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const error = useDodiSessionStore((s) => s.error);
  const connect = useDodiSessionStore((s) => s.connect);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);
  const isOnline = useOnline();

  // Auto-connect on mount if provider available. Skipped while offline; the
  // `isOnline` flip re-runs the effect, so regaining connectivity connects.
  useEffect(() => {
    if (hasProvider && isOnline) {
      void connect(kidId);
    }
  }, [hasProvider, isOnline, connect, kidId]);

  // Manual override: `?process-memory=1` force-processes the day's accumulated
  // transcript into memory now, without waiting for a day change. Read once
  // imperatively (no useSearchParams → no Suspense boundary needed) and strip
  // the param so a refresh won't re-trigger. The store serializes this behind
  // the auto-connect's own memory run above, so it's never lost to that race.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("process-memory") === "1") {
      useDodiSessionStore.getState().processMemoryNow(kidId);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [kidId]);

  const mascotButtonClass =
    "relative z-[1] size-[76%] cursor-pointer transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.94]";
  const mascotImageClass = "relative z-[1]";

  // Offline — dodi sleeps until connectivity returns. Checked before
  // `!hasProvider`: offline also makes the providers fetch fail, which would
  // otherwise mis-render the "needs voice setup" message.
  if (!isOnline) {
    return (
      <Stage>
        <MascotWrap>
          <div className={mascotImageClass + " size-[76%]"}>
            <DodiFigure
              canRender3d
              state="sleep"
              alt="dodi sleeping"
              className="object-contain"
              priority
            />
          </div>
        </MascotWrap>
        <SpeechBubble className="w-full max-w-xs text-center">
          <div className="flex items-center justify-center gap-2">
            <Icon name="wifi_off" className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-bold text-ink-2">{t("offline")}</p>
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {t("offlineHint")}
          </p>
        </SpeechBubble>
      </Stage>
    );
  }

  // No provider configured
  if (!hasProvider) {
    return (
      <Stage>
        <MascotWrap>
          <div className={mascotImageClass + " size-[76%]"}>
            <DodiFigure
              canRender3d
              state="disconnected"
              alt="dodi sleeping"
              className="object-contain"
              priority
            />
          </div>
        </MascotWrap>
        <SpeechBubble className="w-full max-w-xs text-center">
          <p className="text-lg font-extrabold text-ink">
            {t("greetingWithName", { name: kidName })}
          </p>
          <p className="mt-1 text-sm font-bold text-ink-2">{t("needsVoice")}</p>
        </SpeechBubble>
      </Stage>
    );
  }

  // Connecting
  if (dodiState === "connecting") {
    return (
      <Stage>
        <MascotWrap>
          <div className={mascotImageClass + " size-[76%]"}>
            <DodiFigure
              canRender3d
              state="connecting"
              alt="dodi waking up"
              className="object-contain"
              priority
            />
          </div>
        </MascotWrap>
        <SpeechBubble className="w-full max-w-xs text-center">
          <div className="flex items-center justify-center gap-2">
            <Icon name="loading" className="h-4 w-4 animate-spin text-primary" />
            <p className="text-sm font-bold text-ink-2">{t("connecting")}</p>
          </div>
        </SpeechBubble>
      </Stage>
    );
  }

  // Connected: active or deaf
  if (dodiState === "active" || dodiState === "deaf") {
    const showMicError = dodiState === "active" && (error === "micPermissionNeeded" || error === "secureContextRequired");

    return (
      <Stage>
        <MascotWrap listening={dodiState === "active" && !dodiSpeaking}>
          <button
            type="button"
            onClick={toggleActive}
            className={mascotButtonClass}
            aria-label={
              dodiState === "active"
                ? tVoice("voiceAriaStopListening")
                : tVoice("voiceAriaStartListening")
            }
          >
            <DodiFigure
              canRender3d
              state={dodiState}
              alt={dodiState === "active" ? "dodi listening" : "dodi can't hear you"}
              className="object-contain"
              priority
            />
          </button>
        </MascotWrap>
        <SpeechBubble className="w-full max-w-xs text-center">
          {dodiState === "deaf" ? (
            <p className="text-sm font-bold text-ink-2">{t("tapToTalk")}</p>
          ) : dodiSpeaking ? (
            // dodi's voice already says it: the dots are enough to see.
            <div className="flex items-center justify-center gap-1 py-1.5">
              <span className="animate-kdot inline-block h-2 w-2 rounded-full bg-primary" />
              <span className="animate-kdot inline-block h-2 w-2 rounded-full bg-primary [animation-delay:200ms]" />
              <span className="animate-kdot inline-block h-2 w-2 rounded-full bg-primary [animation-delay:400ms]" />
              <span className="sr-only">{t("dodiSpeaking")}</span>
            </div>
          ) : showMicError ? (
            <p className="text-sm font-bold text-ink-2">
              {t(error as "micPermissionNeeded" | "secureContextRequired")}
            </p>
          ) : (
            <p className="text-sm font-bold text-ink-2">{t("listening")}</p>
          )}
        </SpeechBubble>
      </Stage>
    );
  }

  // Sleep (inactivity timeout) — tap to wake
  if (dodiState === "sleep") {
    return (
      <Stage>
        <MascotWrap>
          <button
            type="button"
            onClick={() => void connect(kidId)}
            className={mascotButtonClass}
            aria-label={tVoice("voiceAriaWake")}
          >
            <DodiFigure
              canRender3d
              state="sleep"
              alt="dodi sleeping"
              className="object-contain"
              priority
            />
          </button>
        </MascotWrap>
        <SpeechBubble className="w-full max-w-xs text-center">
          <p className="text-sm font-bold text-ink-2">{t("tapToWake")}</p>
        </SpeechBubble>
      </Stage>
    );
  }

  // Disconnected after an error. The raw message is technical (and English):
  // the kid gets what it means instead. A setup problem gets no retry button,
  // as retrying cannot help until a grown-up fixes it (coming back to the
  // home after that connects again on its own).
  if (error) {
    const errorKind = companionErrorKind(error);

    return (
      <Stage>
        <MascotWrap>
          <div className={mascotImageClass + " size-[76%]"}>
            <DodiFigure
              canRender3d
              state="disconnected"
              alt="dodi sleeping"
              className="object-contain"
              priority
            />
          </div>
        </MascotWrap>
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <SpeechBubble className="w-full text-center">
            <p className="text-sm font-bold text-ink-2">
              {t(errorKind === "connection" ? "connectionError" : errorKind)}
            </p>
          </SpeechBubble>
          {errorKind !== "needsSetup" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void connect(kidId)}
              className="cursor-pointer rounded-full font-bold"
            >
              <Icon name="refresh" className="mr-2 h-4 w-4" />
              {t("retry")}
            </Button>
          )}
        </div>
      </Stage>
    );
  }

  // Idle — tap sleeping Dodi to start
  return (
    <Stage>
      <MascotWrap>
        <button
          type="button"
          onClick={() => void connect(kidId)}
          className={mascotButtonClass}
          aria-label={tVoice("voiceAriaStart")}
        >
          <DodiFigure
            canRender3d
            state="disconnected"
            alt="dodi sleeping"
            className="object-contain"
            priority
          />
        </button>
      </MascotWrap>
      <SpeechBubble className="w-full max-w-xs text-center">
        <p className="text-lg font-extrabold text-ink">
          {t("greetingWithName", { name: kidName })}
        </p>
        <p className="mt-1 text-sm font-bold text-ink-2">{t("tapToTalk")}</p>
      </SpeechBubble>
    </Stage>
  );
}
