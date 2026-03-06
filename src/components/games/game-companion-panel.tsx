"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GeminiLiveClient, type GeminiLiveEvent, type GeminiLiveToolDeclaration } from "@/lib/ai/gemini-live-client";
import { AudioRecorder } from "@/lib/ai/audio-recorder";
import { AudioStreamer } from "@/lib/ai/audio-streamer";
import { extractCommandMarkers } from "@/lib/games/command-markers";
import { cn } from "@/lib/utils";
import { gameDebug, gameDebugWarn } from "@/lib/games/debug";
import type { GameAssistantResponse, GameCommand } from "@/types/games";

type CompanionMode = "text" | "voice";
type VoiceStatus = "idle" | "connecting" | "connected" | "error";

interface CompanionMessage {
  id: string;
  role: "kid" | "dodi";
  text: string;
}

interface GameCompanionPanelProps {
  gameId: string;
  profileId: string;
  gameState: Record<string, unknown>;
  markdown: string;
  codeBundle: string;
  lastGameError?: string | null;
  className?: string;
  onRunCommands: (commands: GameCommand[]) => void;
}

interface GameVoiceSessionConfig {
  apiKey: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
  tools?: GeminiLiveToolDeclaration[];
}

const MAX_MESSAGES = 40;
const STATE_DEBOUNCE_MS = 2000;

function createMessage(role: "kid" | "dodi", text: string): CompanionMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    text,
  };
}

export function GameCompanionPanel({
  gameId,
  profileId,
  gameState,
  markdown,
  codeBundle,
  lastGameError,
  className,
  onRunCommands,
}: GameCompanionPanelProps) {
  const t = useTranslations("games");

  const [mode, setMode] = useState<CompanionMode>("text");
  const [textInput, setTextInput] = useState("");
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [dodiSpeaking, setDodiSpeaking] = useState(false);
  const [interimKidText, setInterimKidText] = useState<string | null>(null);

  const clientRef = useRef<GeminiLiveClient | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const turnBufferRef = useRef("");
  const lastSentStateRef = useRef("");
  const stateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gameStateText = useMemo(
    () => JSON.stringify(gameState ?? {}, null, 2),
    [gameState],
  );

  const pushMessage = useCallback((role: "kid" | "dodi", text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((previous) => {
      const next = [...previous, createMessage(role, trimmed)];
      if (next.length <= MAX_MESSAGES) return next;
      return next.slice(next.length - MAX_MESSAGES);
    });
  }, []);

  const stopVoiceSession = useCallback((): void => {
    recorderRef.current?.stop();
    recorderRef.current = null;

    clientRef.current?.disconnect();
    clientRef.current = null;

    const streamer = streamerRef.current;
    if (streamer) {
      streamer.stop();
      void streamer.destroy();
    }
    streamerRef.current = null;

    turnBufferRef.current = "";
    lastSentStateRef.current = "";

    if (stateDebounceRef.current) {
      clearTimeout(stateDebounceRef.current);
      stateDebounceRef.current = null;
    }

    setVoiceStatus("idle");
    setVoiceError(null);
    setMicActive(false);
    setDodiSpeaking(false);
    setInterimKidText(null);
  }, []);

  const startMicCapture = useCallback(async (): Promise<void> => {
    let recorder = recorderRef.current;
    if (!recorder) {
      recorder = new AudioRecorder((base64Pcm: string) => {
        clientRef.current?.sendAudio(base64Pcm);
      });
      recorderRef.current = recorder;
    }

    try {
      await recorder.start();
      setMicActive(true);
      setVoiceError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("micUnavailable");
      setVoiceError(message || t("micUnavailable"));
      setMicActive(false);
    }
  }, [t]);

  const handleLiveEvent = useCallback((event: GeminiLiveEvent): void => {
    switch (event.type) {
      case "setupComplete":
        gameDebug("voice", "Setup complete, sending greeting and starting mic");
        setVoiceStatus("connected");
        setVoiceError(null);
        clientRef.current?.sendGreeting();
        void startMicCapture();
        return;
      case "audio":
        setDodiSpeaking(true);
        streamerRef.current?.addPcmChunk(event.data);
        return;
      case "text":
        gameDebug("voice", `Text chunk received: "${event.text}"`);
        gameDebug("voice", `Turn buffer now: "${turnBufferRef.current + event.text}"`);
        turnBufferRef.current += event.text;
        return;
      case "inputTranscription":
        gameDebug("voice", `Kid transcription: "${event.text}"`);
        setInterimKidText(event.text);
        return;
      case "toolCall": {
        gameDebug("voice", `Tool call received: ${event.name}(${JSON.stringify(event.args)})`);

        if (event.name === "execute_game_command") {
          const commandType = typeof event.args.type === "string" ? event.args.type : "";
          if (!commandType) {
            gameDebugWarn("voice", "Tool call missing command type");
            clientRef.current?.sendToolResponse(event.id, event.name, {
              ok: false,
              error: "Missing command type",
            });
            return;
          }

          const payload = event.args.payload as GameCommand["payload"];
          const command: GameCommand = { type: commandType, payload };

          gameDebug("voice", "Executing game command from tool call:", command);
          onRunCommands([command]);

          clientRef.current?.sendToolResponse(event.id, event.name, {
            ok: true,
            command: commandType,
          });
        } else {
          gameDebugWarn("voice", `Unknown tool: ${event.name}`);
          clientRef.current?.sendToolResponse(event.id, event.name, {
            ok: false,
            error: `Unknown tool: ${event.name}`,
          });
        }
        return;
      }
      case "turnComplete": {
        setDodiSpeaking(false);
        setInterimKidText(null);

        const turnText = turnBufferRef.current.trim();
        turnBufferRef.current = "";

        if (!turnText) return;

        // Commands are handled by tool calls — marker extraction is a fallback
        const { cleanedText, commands } = extractCommandMarkers(turnText);

        if (cleanedText) {
          pushMessage("dodi", cleanedText);
        }

        if (commands.length > 0) {
          gameDebug("voice", `Marker-based commands in turn text: ${commands.length}`);
          onRunCommands(commands);
        }
        return;
      }
      case "interrupted":
        gameDebug("voice", "Interrupted by user speech");
        setDodiSpeaking(false);
        streamerRef.current?.stop();
        return;
      case "error":
        gameDebugWarn("voice", `Voice error: ${event.error}`);
        setVoiceStatus("error");
        setVoiceError(event.error || t("voiceSessionFailed"));
        setMicActive(false);
        setDodiSpeaking(false);
        return;
      case "closed":
        gameDebug("voice", "Voice session closed");
        setVoiceStatus((previous) => (previous === "error" ? "error" : "idle"));
        setMicActive(false);
        setDodiSpeaking(false);
        return;
    }
  }, [pushMessage, onRunCommands, startMicCapture, t]);

  // Live game state injection for voice sessions
  useEffect(() => {
    const client = clientRef.current;
    if (!client || voiceStatus !== "connected") return;

    const stateJson = JSON.stringify(gameState ?? {});
    if (stateJson === lastSentStateRef.current) return;

    if (stateDebounceRef.current) {
      clearTimeout(stateDebounceRef.current);
    }

    stateDebounceRef.current = setTimeout(() => {
      lastSentStateRef.current = stateJson;
      gameDebug("voice", `Sending game state update to voice session (${stateJson.length} chars)`);
      client.sendContext(`[GAME STATE UPDATE]\n${stateJson}`);
      stateDebounceRef.current = null;
    }, STATE_DEBOUNCE_MS);
  }, [gameState, voiceStatus]);

  async function startVoiceSession(): Promise<void> {
    if (voiceStatus === "connecting" || voiceStatus === "connected") return;

    stopVoiceSession();
    setAssistantError(null);
    setVoiceStatus("connecting");
    setVoiceError(null);
    setDodiSpeaking(false);
    setInterimKidText(null);
    turnBufferRef.current = "";

    try {
      const response = await fetch(`/api/games/${gameId}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          gameState,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: t("voiceSessionFailed") }));
        throw new Error(data.error || t("voiceSessionFailed"));
      }

      const config = (await response.json()) as GameVoiceSessionConfig;
      const streamer = new AudioStreamer();
      streamer.primeFromGesture();
      streamerRef.current = streamer;

      const client = new GeminiLiveClient(
        {
          apiKey: config.apiKey,
          model: config.model,
          voiceName: config.voiceName,
          systemInstruction: config.systemInstruction,
          tools: config.tools,
        },
        handleLiveEvent,
      );

      clientRef.current = client;
      client.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("voiceSessionFailed");
      setVoiceStatus("error");
      setVoiceError(message);
    }
  }

  function toggleMic(): void {
    if (micActive) {
      recorderRef.current?.stop();
      setMicActive(false);
      return;
    }

    void startMicCapture();
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const message = textInput.trim();
    if (!message) return;

    setTextInput("");
    setAssistantError(null);
    pushMessage("kid", message);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/games/${gameId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          message,
          gameState,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: t("assistantFailed") }));
        throw new Error(data.error || t("assistantFailed"));
      }

      const data = (await response.json()) as GameAssistantResponse;
      gameDebug("text", "Assistant response:", { reply: data.reply?.slice(0, 100), commandCount: data.commands?.length ?? 0 });
      if (data.reply) {
        pushMessage("dodi", data.reply);
      }
      if (data.commands?.length) {
        gameDebug("text", "Dispatching commands to game:", data.commands);
      } else {
        gameDebugWarn("text", "No commands in assistant response");
      }
      onRunCommands(data.commands ?? []);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : t("assistantFailed");
      setAssistantError(messageText);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  useEffect(() => {
    if (mode !== "voice") {
      stopVoiceSession();
    }
  }, [mode, stopVoiceSession]);

  const voiceStatusLabel =
    voiceStatus === "connecting"
      ? t("voiceConnecting")
      : dodiSpeaking
        ? t("voiceSpeaking")
        : micActive
          ? t("voiceListening")
          : t("voiceMicOff");

  return (
    <section className={cn("rounded-2xl border bg-white p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-dodi-800">{t("companionTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("companionSubtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "text" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("text")}
          >
            {t("modeText")}
          </Button>
          <Button
            type="button"
            variant={mode === "voice" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("voice")}
          >
            {t("modeVoice")}
          </Button>
        </div>
      </div>

      <div className="mt-3 h-64 space-y-2 overflow-y-auto rounded-xl border bg-dodi-50/40 p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("companionEmptyState")}</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[95%] rounded-xl px-3 py-2 text-sm",
                message.role === "dodi"
                  ? "bg-white text-dodi-800"
                  : "ml-auto bg-dodi-600 text-white",
              )}
            >
              {message.text}
            </div>
          ))
        )}
      </div>

      {lastGameError && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {t("gameCommandFailedLabel")}: {lastGameError}
        </div>
      )}

      {assistantError && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {assistantError}
        </div>
      )}

      <div className="mt-3 rounded-xl border bg-muted/20 p-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("liveState")}
        </p>
        <pre className="mt-1 max-h-28 overflow-auto text-[11px] text-muted-foreground">
          {gameStateText}
        </pre>
      </div>

      {mode === "text" ? (
        <form onSubmit={(event) => void handleTextSubmit(event)} className="mt-3 flex gap-2">
          <Input
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            placeholder={t("companionInputPlaceholder")}
            disabled={submitting}
          />
          <Button type="submit" size="icon" disabled={submitting}>
            {submitting ? (
              <Icon name="loading" className="h-4 w-4 animate-spin" />
            ) : (
              <Icon name="send" className="h-4 w-4" />
            )}
          </Button>
        </form>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <Icon name="volume" className="h-4 w-4" />
            <span>{voiceStatusLabel}</span>
          </div>

          {interimKidText && (
            <div className="rounded-lg border bg-dodi-50 px-3 py-2 text-xs text-dodi-700">
              {t("voiceHeard", { text: interimKidText })}
            </div>
          )}

          {voiceError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {voiceError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {voiceStatus === "connecting" ? (
              <Button type="button" disabled>
                <Icon name="loading" className="mr-2 h-4 w-4 animate-spin" />
                {t("voiceConnecting")}
              </Button>
            ) : voiceStatus === "idle" || voiceStatus === "error" ? (
              <Button
                type="button"
                onClick={() => void startVoiceSession()}
              >
                <Icon name="volume" className="mr-2 h-4 w-4" />
                {t("voiceStart")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant={micActive ? "default" : "outline"}
                  onClick={toggleMic}
                  disabled={voiceStatus !== "connected"}
                >
                  {micActive ? (
                    <Icon name="mic_on" className="mr-2 h-4 w-4" />
                  ) : (
                    <Icon name="mic_off" className="mr-2 h-4 w-4" />
                  )}
                  {micActive ? t("voiceMute") : t("voiceUnmute")}
                </Button>
                <Button type="button" variant="outline" onClick={stopVoiceSession}>
                  <Icon name="stop" className="mr-2 h-4 w-4" />
                  {t("voiceStop")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
