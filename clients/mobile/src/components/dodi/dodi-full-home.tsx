import { Children, type ReactNode, useEffect, useRef } from "react";
import { ActivityIndicator, Image, Pressable, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import { is3dPreferenceOf } from "@dodi/client-state/account-store";
import { companionErrorKind } from "@dodi/client-state/companion-error";
import { kidHomeStage, kidHomeTalk, playground, speechBubble } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { ListeningPulse } from "@/components/kid/listening-pulse";
import { Playground } from "@/components/kid/playground/playground";
import { Button, Icon } from "@/components/ui";
import { useAnnounceOnIos } from "@/lib/announce";
import { cn } from "@/lib/cn";
import { useAccountStore, useCompanionStageStore, useConnectivityStore } from "@/lib/client-state";
import { type DodiState, dodiOutputLevel, selectDodiThinking, useDodiSessionStore } from "@/lib/dodi-session-store";
import { usePlaygroundFrameStore } from "@/lib/playground-frame-store";
import { useActiveCompanion } from "@/lib/use-active-companion";
import { useIsAppActive } from "@/lib/use-app-active";
import { useDodiContext } from "@/lib/use-dodi-context";
import { useKids } from "@/lib/use-kids";

import { Character3d, useCharacterStage } from "./character-3d";
import { getDodiImage } from "./dodi-image";
import { SpeakingDots } from "./speaking-dots";
import { SpeechBubble } from "./speech-bubble";
import { useCompanionStateLabel } from "./use-companion-state-label";
import { useFigureMode } from "./use-figure-mode";

interface DodiFullHomeProps {
  kidId: string;
  hasProvider: boolean;
}

/**
 * Vertically centered column (web: the 3D character's turn/zoom area). It
 * also holds the Playground; while that is open only the character stays (the
 * speech bubble and hints step aside for the tools).
 */
function Stage({ children }: { children: ReactNode }) {
  const isPlaygroundOpen = useCompanionStageStore((s) => s.isPlaygroundOpen);
  const setPanelTop = usePlaygroundFrameStore((s) => s.setPanelTop);
  const ref = useRef<View>(null);
  const shown = isPlaygroundOpen ? Children.toArray(children).slice(0, 1) : children;
  // The panel (drawn by the kid chrome over the nav) starts at the stage's 40% line.
  const measure = (): void =>
    ref.current?.measureInWindow((_x, y, _width, height) => {
      if (height > 0) setPanelTop(y + height * PANEL_TOP_SHARE);
    });
  useEffect(() => () => setPanelTop(null), [setPanelTop]);
  return (
    <View ref={ref} className={kidHomeStage.root} onLayout={measure}>
      <View className={cn(kidHomeStage.inner, isPlaygroundOpen && playground.stageOpen)}>{shown}</View>
      <Playground />
    </View>
  );
}

// Where the Playground panel starts, as a share of the stage's height (the
// recipe's top-[40%] for layouts that draw the panel inside the stage).
const PANEL_TOP_SHARE = 0.4;

/** The mascot box: clamp(170px, 38vh, 300px) square; the figure fills 76%. */
function MascotWrap({ listening, children }: { listening?: boolean; children: ReactNode }) {
  const { height } = useWindowDimensions();
  const isPlaygroundOpen = useCompanionStageStore((s) => s.isPlaygroundOpen);
  const full = Math.min(kidHomeStage.mascotMax, Math.max(kidHomeStage.mascotMin, height * kidHomeStage.mascotVh));
  // With the Playground open the character shares the screen: it fits the top half.
  const size = isPlaygroundOpen ? Math.min(full, height * playground.mascotOpenVh) : full;
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
 * Which one is decided before either shows (@dodi/character/figure-mode):
 * meanwhile the figure's box stays empty, so 2D never turns into 3D.
 */
function Figure({ state, alt, onPress, pressLabel }: FigureProps) {
  // Unknown (null) until the account has loaded: wait for it, don't guess.
  const is3dEnabled = useAccountStore(is3dPreferenceOf);
  const loadAccount = useAccountStore((s) => s.load);
  const { look } = useActiveCompanion();
  const character = useCharacterStage(is3dEnabled !== false, look.model);
  const mode = useFigureMode(is3dEnabled, character.load);
  const isSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const isThinking = useDodiSessionStore(selectDodiThinking);
  // Named by the element around it (the button, the 3D view, the figure box).
  const image = (
    <Image
      source={getDodiImage(state, false)}
      className="h-full w-full"
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
  const stateLabel = useCompanionStateLabel();

  // The setting decides; make sure the account is on its way (single-flight).
  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  if (mode !== "2d") {
    return (
      <View className={cn(kidHomeStage.figure, kidHomeTalk.mascotButton)}>
        <Character3d
          stage={mode === "3d" ? character.stage : null}
          model={character.model}
          look={look}
          onFailed={character.fail}
          state={state}
          isThinking={isThinking}
          isSpeaking={isSpeaking}
          voiceLevel={dodiOutputLevel}
          onPress={onPress}
          alt={pressLabel ?? alt}
          stateLabel={stateLabel}
        />
      </View>
    );
  }
  if (!onPress) {
    return (
      <View
        className={kidHomeStage.figure}
        accessible
        accessibilityRole="image"
        accessibilityLabel={alt}
        accessibilityValue={{ text: stateLabel }}
      >
        {image}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pressLabel ?? alt}
      accessibilityValue={{ text: stateLabel }}
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
  const error = useDodiSessionStore((s) => s.error);
  const connect = useDodiSessionStore((s) => s.connect);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const isAppActive = useIsAppActive();

  // What the bubble says, for VoiceOver (TalkBack reads the bubble's live
  // region). Listening and talking are left out: the conversation itself says
  // so, and a screen reader speaking into the open microphone would be heard.
  const micError = error === "micPermissionNeeded" || error === "secureContextRequired" ? error : null;
  const errorKind = error ? companionErrorKind(error) : null;
  const announcement = !isOnline
    ? `${t("offline")} ${t("offlineHint")}`
    : !hasProvider
      ? t("needsVoice")
      : dodiState === "connecting"
        ? t("connecting")
        : dodiState === "deaf"
          ? t("tapToTalk")
          : dodiState === "active"
            ? micError
              ? t(micError)
              : null
            : dodiState === "sleep"
              ? t("tapToWake")
              : errorKind
                ? t(errorKind === "connection" ? "connectionError" : errorKind)
                : t("tapToTalk");
  useAnnounceOnIos(announcement);

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
        <SpeechBubble className={kidHomeStage.bubbleWrap} isLive={announcement !== null}>
          {dodiState === "deaf" ? (
            <Status>{t("tapToTalk")}</Status>
          ) : dodiSpeaking ? (
            // dodi's voice already says it: the dots are enough to see.
            <View
              className={cn(kidHomeTalk.statusRow, kidHomeTalk.speakingRow)}
              accessible
              accessibilityLabel={t("dodiSpeaking")}
            >
              <SpeakingDots />
            </View>
          ) : showMicError ? (
            <Status>{t(error as "micPermissionNeeded" | "secureContextRequired")}</Status>
          ) : (
            <Status>{t("listening")}</Status>
          )}
        </SpeechBubble>
      </Stage>
    );
  }

  // Asleep (inactivity timeout): tap to wake
  if (dodiState === "sleep") {
    return (
      <Stage>
        <MascotWrap>
          <Figure state="sleep" alt="dodi" onPress={() => void connect(kidId)} pressLabel={tVoice("voiceAriaWake")} />
        </MascotWrap>
        <SpeechBubble className={kidHomeStage.bubbleWrap}>
          <Status>{t("tapToWake")}</Status>
        </SpeechBubble>
      </Stage>
    );
  }

  // Disconnected after an error: what it means for the kid, never the raw
  // (technical, English) message. A setup problem gets no retry button, as
  // retrying cannot help until a grown-up fixes it.
  if (errorKind) {
    return (
      <Stage>
        <MascotWrap>
          <Figure state="disconnected" alt="dodi" />
        </MascotWrap>
        <View className={kidHomeTalk.column}>
          <SpeechBubble className={kidHomeTalk.bubble}>
            <Status>{t(errorKind === "connection" ? "connectionError" : errorKind)}</Status>
          </SpeechBubble>
          {errorKind !== "needsSetup" ? (
            <Button
              variant="outline"
              size="sm"
              icon="refresh"
              onPress={() => void connect(kidId)}
              className={kidHomeTalk.retry}
              textClassName="font-bold"
            >
              {t("retry")}
            </Button>
          ) : null}
        </View>
      </Stage>
    );
  }

  // Idle: tap the sleeping dodi to start
  return (
    <Stage>
      <MascotWrap>
        <Figure state="disconnected" alt="dodi" onPress={() => void connect(kidId)} pressLabel={tVoice("voiceAriaStart")} />
      </MascotWrap>
      <SpeechBubble className={kidHomeStage.bubbleWrap}>
        <KidText className={cn(kidHomeStage.greeting, kidHomeStage.textAlign)}>
          {t("greetingWithName", { name: kidName })}
        </KidText>
        <KidText className={cn(kidHomeStage.line, kidHomeStage.textAlign)}>{t("tapToTalk")}</KidText>
      </SpeechBubble>
    </Stage>
  );
}
