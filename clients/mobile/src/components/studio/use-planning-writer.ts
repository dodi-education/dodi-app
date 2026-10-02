import { useEffect, useRef } from "react";
import type { PlanningState } from "@dodi/studio/plan-state";
import type { StudioKid } from "@dodi/studio/build-runner";
import { resolvePrimaryKidId, type StudioGame } from "@dodi/studio/studio-game";
import { createPlanningWriter, persistPlanning, type PlanningWriter } from "@dodi/studio/studio-plan";
import type { StudioChatMessage } from "@dodi/studio/transcript";

import { mobileStudioEditorPorts as editorPorts } from "@/adapters/studio-ports";

/** How long the Plan step waits after a change before re-sealing it onto the row. */
const PLANNING_PERSIST_DELAY_MS = 800;

interface PlanningWriterInput {
  isPlanning: boolean;
  planning: PlanningState;
  messages: StudioChatMessage[];
  game: StudioGame;
  kids: StudioKid[];
  /** The live game id (null until the first planning write created the row). */
  gameIdRef: { current: string | null };
  /** The first write created the row: adopt its id in place. */
  onCreated: (gameId: string) => void;
  onError: (err: unknown) => void;
}

/**
 * Plan-step persistence (web: the "Plan step persistence" section of
 * game-studio). Once the parent has talked to the plan agent the draft is
 * worth keeping: the first turn creates the row and every later change to the
 * thread, the plan or the sketch/photo re-seals the envelope onto it, debounced
 * and one write at a time (@dodi/studio/studio-plan). Writes read the latest
 * render through refs.
 */
export function usePlanningWriter({
  isPlanning,
  planning,
  messages,
  game,
  kids,
  gameIdRef,
  onCreated,
  onError,
}: PlanningWriterInput): () => PlanningWriter {
  const latest = useRef({ planning, messages, game, kids, onCreated, onError });
  useEffect(() => {
    latest.current = { planning, messages, game, kids, onCreated, onError };
  });

  const writerRef = useRef<PlanningWriter | null>(null);
  // Effects and handlers only (never during render): created on first use.
  const writer = (): PlanningWriter => {
    writerRef.current ??= createPlanningWriter(
      async () => {
        const current = latest.current;
        const result = await persistPlanning(editorPorts, {
          gameId: gameIdRef.current,
          game: current.game,
          kidId: resolvePrimaryKidId(current.game, current.kids),
          planning: current.planning,
          transcript: current.messages,
        });
        if (result.kind === "created") current.onCreated(result.gameId);
      },
      (err) => latest.current.onError(err),
    );
    return writerRef.current;
  };

  // Mark dirty on every change once there has been an interaction (a message
  // in the thread), and write it out after a pause. Past planning nothing runs.
  const { summary, isAccepted, mode, sketchImage, photoImage, sketchStrokes } = planning;
  useEffect(() => {
    if (!isPlanning || messages.length === 0) return;
    writer().markDirty();
    const timer = setTimeout(() => void writer().flush(), PLANNING_PERSIST_DELAY_MS);
    return () => clearTimeout(timer);
    // `writer` is stable (a ref); the planning fields are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlanning, messages, summary, isAccepted, mode, sketchImage, photoImage, sketchStrokes]);

  // Leaving the studio flushes a pending write: the request outlives the screen.
  useEffect(
    () => () => {
      if (writer().isDirty()) void writer().flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return writer;
}
