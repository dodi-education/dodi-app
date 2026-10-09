"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_CHARACTER_MODEL, type CharacterModelRef } from "@dodi/character/character-catalog";
import type { FigureModeInput } from "@dodi/character/figure-mode";
import { companionCharacter } from "@dodi/ui-recipes";

import { useActiveCompanion } from "@/hooks/use-active-companion";
import { useWornLook } from "@/hooks/use-worn-look";
import { characterPoseFor } from "@/lib/character/character-pose";
import { useAccountStore } from "@/stores/account-store";
import { useCompanionStageStore } from "@/stores/companion-stage-store";
import { useDodiSessionStore } from "@/stores/dodi-session-store";

import type { DodiFigureProps } from "./dodi-figure";
import { SleepZzz } from "./sleep-zzz";
import { ThinkBubbles } from "./think-bubbles";
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

function loadStage(model: CharacterModelRef): Promise<StageModule> {
  return import("@/lib/character/character-stage")
    .then(async (mod) => {
      await mod.loadCharacterStage(model);
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
  const isLearning = useCompanionStageStore((s) => s.isLearningTrick);
  const pose = useMemo(
    () => characterPoseFor({ state, isThinking: isThinking ?? false, isSpeaking, isLearning }),
    [state, isThinking, isSpeaking, isLearning],
  );
  const { look: chosenLook } = useActiveCompanion();
  // The family's own avatar or accessories wait for the asset list (a deleted one falls back).
  const wornLook = useWornLook(chosenLook);
  const isLookPending = wornLook === null;
  // A custom avatar whose file fails to load gives way to the default one (not to 2D).
  const [brokenModels, setBrokenModels] = useState<ReadonlySet<string>>(() => new Set());
  const look = useMemo(() => {
    const worn = wornLook ?? chosenLook;
    return brokenModels.has(worn.model) ? { ...worn, model: DEFAULT_CHARACTER_MODEL, colors: {} } : worn;
  }, [wornLook, chosenLook, brokenModels]);
  const model = isLookPending ? DEFAULT_CHARACTER_MODEL : look.model;
  const hostRef = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState<FigureModeInput["load"]>(() =>
    stageModule?.isCharacterStageReady(model) ? "ready" : "loading",
  );
  const [loadedModel, setLoadedModel] = useState<CharacterModelRef | null>(() =>
    stageModule?.isCharacterStageReady(model) ? model : null,
  );
  const loadAccount = useAccountStore((s) => s.load);

  // The setting decides; make sure the account is on its way (single-flight).
  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (is3dEnabled !== true || load === "failed" || loadedModel === model || isLookPending) return;
    let cancelled = false;
    loadStage(model).then(
      () => {
        if (cancelled) return;
        setLoadedModel(model);
        setLoad("ready");
      },
      () => {
        if (cancelled) return;
        if (model !== DEFAULT_CHARACTER_MODEL) setBrokenModels((broken) => new Set(broken).add(model));
        // No WebGL or the model failed to load: the 2D figure.
        else setLoad("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, is3dEnabled, model, loadedModel, isLookPending]);

  const mode = useFigureMode(is3dEnabled, load);
  const isShown3d = mode === "3d";

  // Layout effects, pose first: the canvas moves between views within one
  // commit and its first frame there already shows the new pose.
  useLayoutEffect(() => {
    // DEBUG(sleep-eyes): temporary. Shows a pose the stage never hears about.
    console.info("[character] pose effect", { clip: pose.clip, state, isShown3d, hasStageModule: stageModule !== null });
    if (isShown3d) stageModule?.setCharacterPose(pose);
  }, [isShown3d, pose]); // eslint-disable-line react-hooks/exhaustive-deps -- DEBUG(sleep-eyes): `state` is logged only

  useLayoutEffect(() => {
    if (isShown3d && !isLookPending) stageModule?.setCharacterLook(look);
  }, [isShown3d, look, isLookPending, loadedModel]);

  // While a new avatar loads, the one before stays on screen.
  useLayoutEffect(() => {
    if (!isShown3d || !stageModule || !hostRef.current || !loadedModel) return;
    return stageModule.mountCharacterStage(hostRef.current, loadedModel);
  }, [isShown3d, loadedModel]);

  // Tricks: the Playground and the voice ask through the stage store.
  const trickRequest = useCompanionStageStore((s) => s.trickRequest);
  const setCharacterShown = useCompanionStageStore((s) => s.setCharacterShown);
  const settleTrick = useCompanionStageStore((s) => s.settleTrick);
  useEffect(() => {
    setCharacterShown(isShown3d && loadedModel !== null);
    return () => setCharacterShown(false);
  }, [isShown3d, loadedModel, setCharacterShown]);
  const playedNonce = useRef(0);
  useEffect(() => {
    if (!trickRequest || trickRequest.nonce <= playedNonce.current) return;
    playedNonce.current = trickRequest.nonce;
    const { nonce, trick } = trickRequest;
    if (!stageModule || !loadedModel) {
      settleTrick(nonce, "unavailable");
      return;
    }
    void stageModule.playCharacterTrick(loadedModel, trick.script).then((outcome) => settleTrick(nonce, outcome));
  }, [trickRequest, loadedModel, settleTrick]);

  if (mode === "2d") return fallback;
  // Pending: the figure's box, labelled, with nothing drawn in it yet.
  if (mode === "pending") return <div role="img" aria-label={alt} className={companionCharacter.host} />;
  return (
    <>
      <div ref={hostRef} role="img" aria-label={alt} className={companionCharacter.host} />
      {pose.clip === "sleep" ? <SleepZzz /> : null}
      {pose.clip === "think" ? <ThinkBubbles /> : null}
    </>
  );
}
