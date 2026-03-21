"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDodiContext } from "@/hooks/use-dodi-context";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { GameCodeEditor } from "@/components/games/game-code-editor";
import { GameSandbox, type GameSandboxHandle } from "@/components/games/game-sandbox";
import { Icon } from "@/components/shared/icon";
import type { GameCommand, GameToParentMessage } from "@/types/games";
import type { AgentStep } from "@/types/agent-progress";

// ---------------------------------------------------------------------------
// Step indicator config
// ---------------------------------------------------------------------------

interface StepDef {
  key: AgentStep;
  label: string;
  icon: "book" | "sparkle" | "check";
}

const STEPS: StepDef[] = [
  { key: "reading_docs", label: "Reading", icon: "book" },
  { key: "writing_code", label: "Building", icon: "sparkle" },
  { key: "validating", label: "Testing", icon: "check" },
];

function stepIndex(step: AgentStep): number {
  if (step === "reading_docs") return 0;
  if (step === "writing_code") return 1;
  // validating, fixing_validation, finalizing all map to stage 2
  return 2;
}

// ---------------------------------------------------------------------------
// Elapsed timer hook
// ---------------------------------------------------------------------------

function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(interval);
      setElapsed(0);
    };
  }, [active]);
  return elapsed;
}

// ---------------------------------------------------------------------------
// Step indicator component
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep }: { currentStep: AgentStep }) {
  const activeIdx = stepIndex(currentStep);

  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-0.5 w-6 rounded-full transition-colors duration-300 ${
                  i <= activeIdx ? "bg-dodi-400" : "bg-dodi-200"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ${
                  done
                    ? "bg-dodi-500 text-white"
                    : active
                      ? "bg-dodi-100 text-dodi-600 animate-pulse"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? (
                  <CheckIcon />
                ) : s.icon === "book" ? (
                  <BookIcon />
                ) : s.icon === "sparkle" ? (
                  <SparkleIcon />
                ) : (
                  <TestIcon />
                )}
              </div>
              <span
                className={`text-xs font-medium ${
                  done
                    ? "text-dodi-600"
                    : active
                      ? "text-dodi-700"
                      : "text-gray-400"
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny SVG icons (inline to avoid extra deps)
// ---------------------------------------------------------------------------

function BookIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  );
}

function TestIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Generating placeholder with step indicator
// ---------------------------------------------------------------------------

function GeneratingView({ currentStep, active }: { currentStep: AgentStep; active: boolean }) {
  const elapsed = useElapsed(active);

  return (
    <div className="flex flex-1 items-center justify-center rounded-2xl border border-dodi-200 bg-dodi-50/50 p-8">
      <div className="flex flex-col items-center gap-6">
        <StepIndicator currentStep={currentStep} />
        <div className="text-center">
          <h3 className="text-lg font-bold text-dodi-800">
            Dodi is building your game...
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep chatting with Dodi while you wait!
          </p>
          {elapsed > 0 && (
            <p className="mt-2 text-xs tabular-nums text-dodi-500">{elapsed}s</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlay step indicator (for updates over existing game)
// ---------------------------------------------------------------------------

function UpdatingOverlay({ currentStep, active }: { currentStep: AgentStep; active: boolean }) {
  const elapsed = useElapsed(active);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-4">
        <StepIndicator currentStep={currentStep} />
        <p className="text-sm font-semibold text-dodi-700">Updating your game...</p>
        {elapsed > 0 && (
          <p className="text-xs tabular-nums text-dodi-500">{elapsed}s</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface GameVoiceCreatorProps {
  profileId: string;
  gameId?: string;
  title?: string;
  description?: string;
  codeBundle?: string;
  markdown?: string;
}

export function GameVoiceCreator({
  profileId,
  gameId,
  title,
  description,
  codeBundle,
  markdown,
}: GameVoiceCreatorProps) {
  const sandboxRef = useRef<GameSandboxHandle>(null);
  const setOnRunCommands = useDodiSessionStore((s) => s.setOnRunCommands);
  const setCreatingGame = useDodiSessionStore((s) => s.setCreatingGame);
  const clearCreatingGame = useDodiSessionStore((s) => s.clearCreatingGame);
  const recoverAgentSession = useDodiSessionStore((s) => s.recoverAgentSession);
  const consumeGamePlan = useDodiSessionStore((s) => s.consumeGamePlan);
  const creatingGame = useDodiSessionStore((s) => s.creatingGame);
  const dodiState = useDodiSessionStore((s) => s.state);

  // Consume any pending game plan from home conversation (must be stable across renders)
  const gamePlanRef = useRef(consumeGamePlan());

  // Declare context (include game plan if present)
  useDodiContext({
    context: {
      type: "creating",
      gameId,
      gamePlan: gamePlanRef.current?.plan,
      gamePlanTitle: gamePlanRef.current?.title,
      gamePlanSubject: gamePlanRef.current?.subject,
    },
    displayMode: "full",
    profileId,
  });

  // Initialize creatingGame from props (remix) or plan (home creation), then
  // always check DB for active agent sessions to recover progress UI
  useEffect(() => {
    if (gameId && codeBundle) {
      setCreatingGame({
        title: title ?? "",
        description: description ?? "",
        codeBundle,
        markdown: markdown ?? null,
        savedGameId: gameId,
      });
    } else if (gamePlanRef.current) {
      setCreatingGame({
        title: gamePlanRef.current.title || "",
        subject: gamePlanRef.current.subject || "creativity",
      });
    }

    // Always check DB for active/completed agent sessions (merges with existing state)
    recoverAgentSession(profileId, gameId);

    return () => {
      clearCreatingGame();
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire up command handler for sandbox
  const handleRunCommands = useCallback(
    (commands: GameCommand[]) => {
      const sandbox = sandboxRef.current;
      if (!sandbox) return;
      for (const cmd of commands) {
        sandbox.sendCommand(cmd);
      }
    },
    [],
  );

  useEffect(() => {
    setOnRunCommands(handleRunCommands);
    return () => setOnRunCommands(null);
  }, [handleRunCommands, setOnRunCommands]);

  // Handle sandbox messages (errors etc.)
  const handleSandboxMessage = useCallback((_message: GameToParentMessage) => {
    // Errors are already logged by the sandbox debug shim.
    // Sandbox state updates are not relevant in creation mode since
    // we don't track live game state during creation.
  }, []);

  const [codeEditorOpen, setCodeEditorOpen] = useState(false);

  const currentCode = creatingGame?.codeBundle;
  const iterationCount = creatingGame?.iterationCount ?? 0;
  const generating = creatingGame?.generating ?? false;
  const progress = creatingGame?.progress ?? null;

  // Auto-close code editor when generation starts
  useEffect(() => {
    if (generating) setCodeEditorOpen(false);
  }, [generating]);

  const isConnected = dodiState === "active" || dodiState === "deaf" || dodiState === "connecting";

  return (
    <div className="flex h-full w-full flex-col gap-3">
      {currentCode ? (
        <div className="flex flex-1 gap-1">
          <div className="relative flex-1 overflow-hidden rounded-2xl border bg-white shadow-sm">
            <GameSandbox
              key={`creating-${iterationCount}`}
              ref={sandboxRef}
              gameId={gameId ?? `new-${iterationCount}`}
              codeBundle={currentCode}
              className="h-full w-full border-0"
              onMessage={handleSandboxMessage}
            />
            {generating && (
              <UpdatingOverlay
                currentStep={progress?.step ?? "reading_docs"}
                active={generating}
              />
            )}
            {codeEditorOpen && currentCode && (
              <GameCodeEditor
                code={currentCode}
                gameId={creatingGame?.savedGameId ?? null}
                onSave={(newCode) => {
                  setCreatingGame({
                    codeBundle: newCode,
                    iterationCount: iterationCount + 1,
                  });
                  setCodeEditorOpen(false);
                }}
                onClose={() => setCodeEditorOpen(false)}
              />
            )}
          </div>
          {!generating && (
            <div className="flex pt-1">
              <button
                onClick={() => setCodeEditorOpen(!codeEditorOpen)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  codeEditorOpen
                    ? "bg-dodi-100 text-dodi-600"
                    : "text-gray-400 hover:bg-gray-100 hover:text-dodi-600"
                }`}
                aria-label={codeEditorOpen ? "Close code editor" : "Open code editor"}
              >
                <Icon name="code" size={18} />
              </button>
            </div>
          )}
        </div>
      ) : generating ? (
        <GeneratingView
          currentStep={progress?.step ?? "reading_docs"}
          active={generating}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-dodi-300 bg-white/50 p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-dodi-100">
              <svg
                className="h-10 w-10 text-dodi-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-dodi-800">
              {gameId ? "Ready to remix!" : "Tell Dodi about your dream game!"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isConnected
                ? "Talk to Dodi and describe what kind of game you want to create."
                : "Tap Dodi to start talking about your game idea."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
