"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { characterPoseFor } from "@/lib/character/character-pose";
import { useDodiSessionStore } from "@/stores/dodi-session-store";

import type { DodiFigureProps } from "./dodi-figure";
import { SleepZzz } from "./sleep-zzz";

type StageModule = typeof import("@/lib/character/character-stage");

interface DodiCharacter3dProps extends DodiFigureProps {
  /** The 2D figure, shown until the character has loaded (or if it cannot). */
  fallback: ReactNode;
}

// Once loaded, later mounts (a view switching state) show the character in the
// same frame instead of flashing the 2D fallback.
let stageModule: StageModule | null = null;

function loadStage(): Promise<StageModule> {
  return import("@/lib/character/character-stage")
    .then(async (mod) => {
      await mod.loadCharacterStage();
      stageModule = mod;
      return mod;
    })
    .catch((err: unknown) => {
      console.warn("[character] 3D character unavailable, showing the 2D figure:", err);
      throw err;
    });
}

/**
 * dodi as the 3D character (`characters/dodi/dodi.glb`, format v1 in
 * `characters/README.md`). The renderer (three.js) is lazy-loaded from here,
 * so accounts with the 3D character off never download it; `fallback` shows
 * meanwhile, and stays if WebGL or the model is unavailable.
 */
export function DodiCharacter3d({ state, isThinking, alt, fallback }: DodiCharacter3dProps) {
  const isSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const pose = useMemo(
    () => characterPoseFor({ state, isThinking: isThinking ?? false, isSpeaking }),
    [state, isThinking, isSpeaking],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(() => stageModule?.isCharacterStageReady() ?? false);

  useEffect(() => {
    if (isReady) return;
    let cancelled = false;
    loadStage().then(
      () => {
        if (!cancelled) setIsReady(true);
      },
      () => {
        // No WebGL or the model failed to load: keep the 2D figure.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isReady]);

  // Layout effects, pose first: the canvas moves between views within one
  // commit and its first frame there already shows the new pose.
  useLayoutEffect(() => {
    if (isReady) stageModule?.setCharacterPose(pose);
  }, [isReady, pose]);

  useLayoutEffect(() => {
    if (!isReady || !stageModule || !hostRef.current) return;
    return stageModule.mountCharacterStage(hostRef.current);
  }, [isReady]);

  if (!isReady) return fallback;
  return (
    <>
      <div ref={hostRef} role="img" aria-label={alt} className="absolute inset-0" />
      {pose.clip === "sleep" ? <SleepZzz /> : null}
    </>
  );
}
