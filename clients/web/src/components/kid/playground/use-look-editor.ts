"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { saveCompanionLook } from "@dodi/client-state/companions";
import { isSameLook, type CompanionLook } from "@dodi/character/character-look";

import { useActiveCompanion } from "@/hooks/use-active-companion";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { useCompanionStageStore } from "@/stores/companion-stage-store";

const SAVE_DELAY_MS = 800;

export type LookSaveStatus = "idle" | "saving" | "saved" | "failed";

/**
 * Edits the active companion's look: every change shows at once (the stage's
 * preview look) and is saved shortly after the last one, and when the
 * Playground closes.
 */
export function useLookEditor(): {
  look: CompanionLook;
  change: (next: CompanionLook) => void;
  status: LookSaveStatus;
} {
  const { kid, companion, look, savedLook } = useActiveCompanion();
  const setPreviewLook = useCompanionStageStore((s) => s.setPreviewLook);
  const [status, setStatus] = useState<LookSaveStatus>("idle");
  const pending = useRef<{ kidId: string; companionId: string; look: CompanionLook } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    setStatus("saving");
    try {
      await saveCompanionLook(companionFlowDeps(), job.kidId, job.companionId, job.look);
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  }, []);

  const change = useCallback(
    (next: CompanionLook) => {
      if (!kid || !companion) return;
      setPreviewLook(next);
      pending.current = { kidId: kid.id, companionId: companion.id, look: next };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [kid, companion, setPreviewLook, flush],
  );

  // Leaving (the Playground closes, the companion switches): save what's left.
  useEffect(() => () => void flush(), [flush, companion?.id]);

  // Once saved, the saved look shows by itself.
  useEffect(() => {
    const preview = useCompanionStageStore.getState().previewLook;
    if (preview && !pending.current && isSameLook(preview, savedLook)) setPreviewLook(null);
  }, [savedLook, setPreviewLook]);

  return { look, change, status };
}
