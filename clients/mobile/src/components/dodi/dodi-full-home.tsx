import { type ReactNode, useEffect } from "react";
import { ActivityIndicator, Image, Pressable, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import { interfacePreferencesOf } from "@dodi/client-state/account-store";
import { kidHomeStage, kidHomeTalk, speechBubble } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { ListeningPulse } from "@/components/kid/listening-pulse";
import { Button, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAccountStore, useConnectivityStore } from "@/lib/client-state";
import { type DodiState, dodiOutputLevel, selectDodiThinking, useDodiSessionStore } from "@/lib/dodi-session-store";
import { useIsAppActive } from "@/lib/use-app-active";
import { useDodiContext } from "@/lib/use-dodi-context";
import { useKids } from "@/lib/use-kids";

import { Character3d } from "./character-3d";
import { getDodiImage } from "./dodi-image";
import { SpeakingDots } from "./speaking-dots";
import { SpeechBubble } from "./speech-bubble";

interface DodiFullHomeProps {
  kidId: string;
  hasProvider: boolean;
}

/** Vertically centered column (web: the 3D character's turn/zoom area). */
function Stage({ children }: { children: ReactNode }) {
  return (
    <View className={kidHomeStage.root}>
      <View className={kidHomeStage.inner}>{children}</View>
    </View>
  );
}

/** The mascot box: clamp(170px, 38vh, 300px) square; the figure fills 76%. */
function MascotWrap({ listening, children }: { listening?: boolean; children: ReactNode }) {
  const { height } = useWindowDimensions();
  const size = Math.min(kidHomeStage.mascotMax, Math.max(kidHomeStage.mascotMin, height * kidHomeStage.mascotVh));
  return (
    <View className={kidHomeStage.mascot} style={{ width: size }}>
      {listening ? <ListeningPulse /> : null}
      {children}
    </View>
  );
}

interface FigureProps {
  state: DodiState;
  alt: string;
  /** Tap (talk / wake); unset, the figure is not a control. */
  onPress?: () => void;
  /** The control's label (web: the mascot button's aria-label). */
  pressLabel?: string;
}

/**
 * dodi as the 3D character (when the account has it on, as the web's
 * DodiFigure canRender3d) or the state's artwork, driven by the session.
 */
function Figure({ state, alt, onPress, pressLabel }: FigureProps) {
  const is3dEnabled = useAccountStore((s) => interfacePreferencesOf(s.account).is_3d_enabled !== false);
  const isSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const isThinking = useDodiSessionStore(selectDodiThinking);
  const image = (
    <Image source={getDodiImage(state, false)} className="h-full w-full" resizeMode="contain" accessibilityLabel={alt} />
  );

  if (is3dEnabled) {
    return (
      <View className={cn(kidHomeStage.figure, kidHomeTalk.mascotButton)}>
        <Character3d
          state={state}
          isThinking={isThinking}
          isSpeaking={isSpeaking}
          voiceLevel={dodiOutputLevel}
          onPress={onPress}
          alt={pressLabel ?? alt}
          fallback={image}
        />
      </View>
    );
  }
  if (!onPress) return <View className={kidHomeStage.figure}>{image}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pressLabel ?? alt}
      onPress={onPress}
      className={cn(kidHomeTalk.mascotButton, "active:scale-[0.94]")}
    >
      {image}
    </Pressable>
  );
}

/** One status line in the bubble. */
function Status({ children }: { children: ReactNode }) {
  return <KidText className={cn(kidHomeTalk.status, kidHomeStage.textAlign)}>{children}</KidText>;
}

/**
 * The kid home's companion (web: components/dodi/dodi-full-home): dodi on its
 * stage, running the voice session. It connects on its own (online, a provider
 * set up, the app in the foreground); a tap on dodi turns listening on or off,
 * wakes it, or retries; the bubble says what dodi is doing.
 */
export function DodiFullHome({ kidId, hasProvider }: DodiFullHomeProps) {
  const t = useTranslations("kid");
  const tVoice = useTranslations("games");

  const { kids } = useKids();
  const kidName = kids?.find((p) => p.id === kidId)?.display_name ?? "";

  useDodiContext({ context: { type: "home" }, displayMode: "full", kidId });

  const dodiState = useDodiSessionStore((s) => s.state);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const gestureNeeded = useDodiSessionStore((s) => s.gestureNeeded);
  const error = useDodiSessionStore((s) => s.error);
  const connect = useDodiSessionStore((s) => s.connect);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const isAppActive = useIsAppActive();

  // Auto-connect with a provider, online and in the foreground; each flip
  // re-runs this, so regaining connectivity (or the foreground) connects.
  useEffect(() => {
    if (hasProvider && isOnline && isAppActive) void connect(kidId);
  }, [hasProvider, isOnline, isAppActive, connect, kidId]);

  // Offline: dodi sleeps until connectivity returns. Checked before
  // `!hasProvider`: offline also fails the providers load.
  if (!isOnline) {
    return (
      <Stage>
        <MascotWrap>
          <Figure state="sleep" alt="dodi" />
        </MascotWrap>
        <SpeechBubble className={kidHomeStage.bubbleWrap}>
          <View className={kidHomeStage.offlineRow}>
            <Icon name="wifi_off" size={16} color="muted-foreground" />
            <KidText className={cn(speechBubble.text, "text-sm")}>{t("offline")}</KidText>
          </View>
          <KidText className={cn(kidHomeStage.hint, kidHomeStage.textAlign)}>{t("offlineHint")}</KidText>
        </SpeechBubble>
      </Stage>
    );
  }

  // No provider configured
  if (!hasProvider) {
    return (
      <Stage>
        <MascotWrap>
          <Figure state="disconnected" alt="dodi" />
        </MascotWrap>
        <SpeechBubble className={kidHomeStage.bubbleWrap}>
          <KidText className={cn(kidHomeStage.greeting, kidHomeStage.textAlign)}>
            {t("greetingWithName", { name: kidName })}
          </KidText>
          <KidText className={cn(kidHomeStage.line, kidHomeStage.textAlign)}>{t("needsVoice")}</KidText>
        </SpeechBubble>
      </Stage>
    );
  }

  if (dodiState === "connecting") {
    return (
      <Stage>
        <MascotWrap>
          <Figure state="connecting" alt={tVoice("voiceAriaConnecting")} />
        </MascotWrap>
        <SpeechBubble className={kidHomeStage.bubbleWrap}>
          <View className={kidHomeTalk.statusRow} accessibilityState={{ busy: true }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Status>{t("connecting")}</Status>
          </View>
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
          <Figure
            state={dodiState}
            alt="dodi"
            onPress={toggleActive}
            pressLabel={
              dodiState === "active" ? tVoice("voiceAriaStopListening") : tVoice("voiceAriaStartListening")
            }
          />
        </MascotWrap>
        <View className={kidHomeTalk.column}>
          <SpeechBubble className={kidHomeTalk.bubble}>
            {dodiState === "deaf" && gestureNeeded ? (
              <Status>{t("tapToTalk")}</Status>
            ) : dodiState === "deaf" ? (
              <Status>{t("tapToStart")}</Status>
            ) : dodiSpeaking ? (
              <View className={kidHomeTalk.statusRow}>
                <SpeakingDots />
                <Status>{t("dodiSpeaking")}</Status>
              </View>
            ) : showMicError ? (
              <Status>{t(error as "micPermissionNeeded" | "secureContextRequired")}</Status>
            ) : (
              <Status>{t("listening")}</Status>
            )}
          </SpeechBubble>
          <KidText className={cn(kidHomeTalk.tapHint, kidHomeStage.textAlign)}>
            {dodiState === "active" && !showMicError ? t("tapToTalk") : " "}
          </KidText>
        </View>
      </Stage>
    );
  }

  // Asleep (inactivity timeout): tap to wake
  if (dodiState === "sleep") {
    return (
      <Stage>
        <MascotWrap>
          <Figure state="sleep" alt="dodi" onPress={() => void connect(kidId)} pressLabel={t("tapToStart")} />
        </MascotWrap>
        <SpeechBubble className={kidHomeStage.bubbleWrap}>
          <Status>{t("tapToStart")}</Status>
        </SpeechBubble>
      </Stage>
    );
  }

  // Disconnected after an error
  if (error) {
    const knownErrors = ["micPermissionNeeded", "secureContextRequired"] as const;
    const isKnownError = knownErrors.some((key) => error === key);
    const errorMessage = isKnownError ? t(error as (typeof knownErrors)[number]) : t("connectionError");
    return (
      <Stage>
        <MascotWrap>
          <Figure state="disconnected" alt="dodi" />
        </MascotWrap>
        <View className={kidHomeTalk.column}>
          <SpeechBubble className={kidHomeTalk.bubble}>
            <Status>{errorMessage}</Status>
            {!isKnownError ? (
              <KidText className={cn(kidHomeStage.hint, kidHomeStage.textAlign)}>{error}</KidText>
            ) : null}
          </SpeechBubble>
          <Button
            variant="outline"
            size="sm"
            icon="refresh"
            onPress={() => void connect(kidId)}
            className={kidHomeTalk.retry}
            textClassName="font-bold"
          >
            {t("tapToRetry")}
          </Button>
        </View>
      </Stage>
    );
  }

  // Idle: tap the sleeping dodi to start
  return (
    <Stage>
      <MascotWrap>
        <Figure state="disconnected" alt="dodi" onPress={() => void connect(kidId)} pressLabel={t("tapToStart")} />
      </MascotWrap>
      <SpeechBubble className={kidHomeStage.bubbleWrap}>
        <KidText className={cn(kidHomeStage.greeting, kidHomeStage.textAlign)}>
          {t("greetingWithName", { name: kidName })}
        </KidText>
        <KidText className={cn(kidHomeStage.line, kidHomeStage.textAlign)}>{t("tapToStart")}</KidText>
      </SpeechBubble>
    </Stage>
  );
}
