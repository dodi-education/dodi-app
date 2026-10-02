"use client";

/**
 * Export a game as a portable `.dodi-game.zip`.
 *
 * Two sources:
 * - `owned` (default): private studio game. Assembled entirely in the browser
 *   from the decrypted vault cache; the server never sees the archive. The
 *   dodi conversation is opt-in (it can carry attached reference photos).
 * - `discover`: published Discover game. Content is plaintext by design —
 *   fetched from the Discover detail endpoint and packed the same way, with
 *   no conversation (review/publish strips it).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { downloadBlob, zipBlob } from "@/lib/games/game-export-zip";
import { gameFlowDeps } from "@/lib/games/game-flow-deps";
import { cn } from "@/lib/utils";
import { useVaultStore } from "@/stores/vault-store";
import {
  type GameExportSource,
  GameExportLoadError,
  buildGameExportArchive,
  loadExportTranscript,
} from "@dodi/client-state/game-transfer";
import { dialogField, exportOption, formAlert } from "@dodi/ui-recipes";

interface GameExportDialogProps {
  open: boolean;
  /** Stays set while the dialog animates closed, so the content doesn't blank out. */
  gameId: string | null;
  onClose: () => void;
  /** Where to load the game content from. Defaults to an owned studio game. */
  source?: GameExportSource;
}

export function GameExportDialog({
  open,
  gameId,
  onClose,
  source = "owned",
}: GameExportDialogProps) {
  const t = useTranslations("gameStudio");
  const session = useVaultStore((s) => s.session);

  const [withTranscript, setWithTranscript] = useState(false);
  const [transcript, setTranscript] = useState<unknown[] | null>(null);
  /** Which game `transcript` belongs to — guards against showing game A's while B loads. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discover exports have no parent conversation: reset on each open
  // (render-phase adjustment, no effect).
  const discoverOpenFor = open && gameId && source === "discover" ? gameId : null;
  const [prevDiscoverOpenFor, setPrevDiscoverOpenFor] = useState<string | null>(null);
  if (discoverOpenFor !== prevDiscoverOpenFor) {
    setPrevDiscoverOpenFor(discoverOpenFor);
    if (discoverOpenFor) {
      setTranscript(null);
      setWithTranscript(false);
      setError(null);
      setLoadedFor(discoverOpenFor);
    }
  }

  // Owned only: unseal the stored conversation so the toggle can say whether
  // there is one.
  useEffect(() => {
    if (!open || !gameId || source !== "owned") return;
    let cancelled = false;
    // Re-runs when the vault unlocks (`session`), so the toggle can enable.
    void loadExportTranscript(gameFlowDeps(), gameId)
      .then((restored) => {
        if (cancelled) return;
        setTranscript(restored);
        // Opting in is per-game and per-open; never carry it over.
        setWithTranscript(false);
        setError(null);
        setLoadedFor(gameId);
      })
      .catch(() => {
        if (!cancelled) setLoadedFor(gameId);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gameId, session, source]);

  const runExport = useCallback(async () => {
    if (!gameId || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const archive = await buildGameExportArchive(gameFlowDeps(), {
        gameId,
        source,
        transcript: withTranscript && loadedFor === gameId ? transcript : null,
        appVersion: "dodi web",
      });
      downloadBlob(zipBlob(archive.bytes), archive.fileName);
      onClose();
    } catch (e) {
      const reason =
        e instanceof GameExportLoadError
          ? t("exportFailedGeneric")
          : e instanceof Error && e.message
            ? e.message
            : "";
      setError(reason ? t("exportFailed", { reason }) : t("exportFailedGeneric"));
    } finally {
      setExporting(false);
    }
  }, [
    gameId,
    exporting,
    withTranscript,
    transcript,
    loadedFor,
    onClose,
    t,
    source,
  ]);

  const hasTranscript =
    source === "owned" && loadedFor === gameId && transcript !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !exporting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exportTitle")}</DialogTitle>
          <DialogDescription>{t("exportDescription")}</DialogDescription>
        </DialogHeader>
        {source === "owned" && (
          <div className={cn(exportOption.webGroup, exportOption.group)}>
            <label className={cn(exportOption.web, exportOption.box, exportOption.text)}>
              <Switch
                checked={withTranscript && hasTranscript}
                disabled={!hasTranscript}
                onCheckedChange={setWithTranscript}
              />
              {t("exportIncludeTranscript")}
            </label>
            {!hasTranscript && (
              <p className={dialogField.note}>
                {t(session ? "exportTranscriptEmpty" : "exportTranscriptLocked")}
              </p>
            )}
          </div>
        )}
        {error && (
          <div className={cn(formAlert.box, formAlert.text)}>
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            {t("exportCancel")}
          </Button>
          <Button onClick={runExport} disabled={exporting}>
            <Icon name="download" size={16} />
            {t("exportConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
