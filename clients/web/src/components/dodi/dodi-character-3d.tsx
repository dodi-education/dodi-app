"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FigureModeInput } from "@dodi/character/figure-mode";
import { companionCharacter } from "@dodi/ui-recipes";

import { characterPoseFor } from "@/lib/character/character-pose";
import { useAccountStore } from "@/stores/account-store";
import { useDodiSessionStore } from "@/stores/dodi-session-store";

import type { DodiFigureProps } from "./dodi-figure";
import { SleepZzz } from "./sleep-zzz";
import { useFigureMode } from "./use-figure-mode";

type StageModule = typeof import("@/lib/character/character-stage");

interface DodiCharacter3dProps extends DodiFigureProps {
  /** The account's 3D setting; null while the account loads. */
  is3dEnabled: boolean | null;
  /** The 2D figure, for when this view settles on it (3D off, unavailable or too slow). */
  fallback: ReactNode;
}

// Once loaded, later mounts (a view switching state) decide on the character
// in their first render instead of waiting.
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
 * `characters/README.md`; scene logic in @dodi/character, shared with the
 * app's components/dodi/character-3d), or `fallback`: which one is decided
 * before either shows (@dodi/character/figure-mode), so the view never swaps
 * 2D for 3D. Meanwhile the figure's box stays empty. The renderer (three.js)
 * is lazy-loaded from here, so accounts with the 3D character off never
 * download it.
 */
export function DodiCharacter3d({ state, isThinking, alt, is3dEnabled, fallback }: DodiCharacter3dProps) {
  const isSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const pose = useMemo(
    () => characterPoseFor({ state, isThinking: isThinking ?? false, isSpeaking }),
    [state, isThinking, isSpeaking],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState<FigureModeInput["load"]>(() =>
    stageModule?.isCharacterStageReady() ? "ready" : "loading",
  );
  const loadAccount = useAccountStore((s) => s.load);

  // The setting decides; make sure the account is on its way (single-flight).
  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (load !== "loading" || is3dEnabled !== true) return;
    let cancelled = false;
    loadStage().then(
      () => {
        if (!cancelled) setLoad("ready");
      },
      () => {
        // No WebGL or the model failed to load: the 2D figure.
        if (!cancelled) setLoad("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, is3dEnabled]);

  const mode = useFigureMode(is3dEnabled, load);
  const isShown3d = mode === "3d";

  // Layout effects, pose first: the canvas moves between views within one
  // commit and its first frame there already shows the new pose.
  useLayoutEffect(() => {
    if (isShown3d) stageModule?.setCharacterPose(pose);
  }, [isShown3d, pose]);

  useLayoutEffect(() => {
    if (!isShown3d || !stageModule || !hostRef.current) return;
    return stageModule.mountCharacterStage(hostRef.current);
  }, [isShown3d]);

  if (mode === "2d") return fallback;
  // Pending: the figure's box, labelled, with nothing drawn in it yet.
  if (mode === "pending") return <div role="img" aria-label={alt} className={companionCharacter.host} />;
  return (
    <>
      <div ref={hostRef} role="img" aria-label={alt} className={companionCharacter.host} />
      {pose.clip === "sleep" ? <SleepZzz /> : null}
    </>
  );
}
