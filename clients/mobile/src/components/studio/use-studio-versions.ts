import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "use-intl";
import type { StudioGame } from "@dodi/studio/studio-game";
import {
  type GameVersionEntry,
  listGameVersions,
  loadVersionCode,
  restoreGameVersion,
} from "@dodi/studio/studio-versions";

import { mobileStudioEditorPorts as editorPorts } from "@/adapters/studio-ports";

import type { CodeViewerVersion } from "./code-viewer";

interface StudioVersionsInput {
  game: StudioGame;
  setGame: (update: (g: StudioGame) => StudioGame) => void;
  /** A plan turn or a build is running: no switching meanwhile. */
  isThinking: boolean;
  setError: (message: string | null) => void;
  /** "Couldn't save: {reason}" in the parent's language. */
  saveFailedMessage: (reason: string) => string;
}

export interface StudioVersions {
  /** The previous version's code (the diff base), once loaded. */
  previousCode: string | null;
  /** A previous version exists and differs: Show changes / Revert are offered. */
  canDiff: boolean;
  isReverting: boolean;
  /** The last change is currently reverted (the link reads "Restore"). */
  isReverted: boolean;
  versionOptions: CodeViewerVersion[];
  loadVersions: () => Promise<void>;
  revertCode: () => Promise<void>;
  selectVersion: (versionId: string) => void;
  /** A build changed the code: the revert memory no longer applies. */
  forgetRevert: () => void;
}

/**
 * The studio's version history (web: the version section of game-studio):
 * the lean list, the previous version's code as the diff base, and switching
 * the game to a version (Revert / Restore, or a pick from the selector).
 */
export function useStudioVersions({
  game,
  setGame,
  isThinking,
  setError,
  saveFailedMessage,
}: StudioVersionsInput): StudioVersions {
  const locale = useLocale();
  const [isReverting, setIsReverting] = useState(false);
  const [isReverted, setIsReverted] = useState(false);
  // Lean entries, newest first, and a per-version code cache filled lazily for diff bases.
  const [versions, setVersions] = useState<GameVersionEntry[]>([]);
  const [versionCodes, setVersionCodes] = useState<Record<string, string>>({});
  // The version left behind by the last Revert, so Restore can go forward again.
  const redoVersionRef = useRef<string | null>(null);

  const loadVersions = useCallback(async (): Promise<void> => {
    if (!game.id) return;
    // Null = unavailable: history is non-critical chrome.
    const list = await listGameVersions(editorPorts, game.id);
    if (list) setVersions(list);
  }, [game.id]);

  useEffect(() => {
    void (async () => {
      await loadVersions();
    })();
  }, [loadVersions]);

  const currentVersion = versions.find((v) => v.id === game.currentGameVersionId) ?? null;
  const previousVersionId = currentVersion?.previous_game_version_id ?? null;

  useEffect(() => {
    const gameId = game.id;
    if (!gameId || !previousVersionId) return;
    if (versionCodes[previousVersionId] !== undefined) return;
    let isCancelled = false;
    void (async () => {
      const code = await loadVersionCode(editorPorts, gameId, previousVersionId);
      if (code !== null && !isCancelled) {
        setVersionCodes((m) => ({ ...m, [previousVersionId]: code }));
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [game.id, previousVersionId, versionCodes]);

  const previousCode = previousVersionId ? (versionCodes[previousVersionId] ?? null) : null;
  const canDiff = Boolean(previousCode) && previousCode !== game.codeBundle;

  // The server copies that version's code into the game and moves the head pointer.
  const switchToVersion = async (versionId: string): Promise<boolean> => {
    if (!game.id || isReverting || isThinking || versionId === game.currentGameVersionId) return false;
    setIsReverting(true);
    setError(null);
    try {
      const row = await restoreGameVersion(editorPorts, game.id, versionId);
      setGame((g) => ({ ...g, codeBundle: row.code_bundle, currentGameVersionId: row.current_game_version_id }));
      return true;
    } catch (e) {
      setError(saveFailedMessage(e instanceof Error && e.message ? e.message : ""));
      return false;
    } finally {
      setIsReverting(false);
    }
  };

  // Revert = step back to the previous version; Restore = forward to the one the revert left.
  const revertCode = async (): Promise<void> => {
    if (isReverted) {
      const redo = redoVersionRef.current;
      if (redo && (await switchToVersion(redo))) {
        redoVersionRef.current = null;
        setIsReverted(false);
      }
      return;
    }
    if (!previousVersionId) return;
    const leaving = game.currentGameVersionId;
    if (await switchToVersion(previousVersionId)) {
      redoVersionRef.current = leaving;
      setIsReverted(true);
    }
  };

  const selectVersion = (versionId: string): void => {
    redoVersionRef.current = null;
    setIsReverted(false);
    void switchToVersion(versionId);
  };

  const forgetRevert = (): void => {
    redoVersionRef.current = null;
    setIsReverted(false);
  };

  const versionOptions = versions.map((v) => ({
    id: v.id,
    dateLabel: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(v.created_at),
    ),
  }));

  return {
    previousCode,
    canDiff,
    isReverting,
    isReverted,
    versionOptions,
    loadVersions,
    revertCode,
    selectVersion,
    forgetRevert,
  };
}
