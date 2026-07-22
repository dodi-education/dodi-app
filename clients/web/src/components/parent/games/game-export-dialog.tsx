"use client";

/**
 * Export a game as a portable `.dodi-game.zip`.
 *
 * Assembled entirely in the browser — the server never sees the archive, and it
 * couldn't build one anyway: every field in it (title, code, markdown, goal) is
 * E2EE, so the plaintext only exists in an unlocked vault. The game row comes
 * from the decrypted cache; the dodi conversation is unsealed from
 * `agent_transcript_enc` and is opt-in, because it can carry the reference
 * photos the parent attached while building.
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
import { downloadBlob, packGameExportZip } from "@/lib/games/game-export-zip";
import { useGameStore } from "@/stores/game-store";
import { useVaultStore } from "@/stores/vault-store";
import { buildGameExportFiles, gameExportFileName } from "@dodi/games/export";

interface GameExportDialogProps {
  open: boolean;
  /** Stays set while the dialog animates closed, so the content doesn't blank out. */
  gameId: string | null;
  onClose: () => void;
}

export function GameExportDialog({ open, gameId, onClose }: GameExportDialogProps) {
  const t = useTranslations("gameStudio");
  const session = useVaultStore((s) => s.session);

  const [withTranscript, setWithTranscript] = useState(false);
  const [transcript, setTranscript] = useState<unknown[] | null>(null);
  /** Which game `transcript` belongs to — guards against showing game A's while B loads. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unseal the stored conversation up front so the toggle can say whether there
  // is one. It was pruned of older attachments before sealing, so it is used
  // as-is. A locked vault simply yields nothing to include.
  useEffect(() => {
    // Re-read on every open: the conversation may have grown since last time.
    if (!open || !gameId) return;
    let cancelled = false;
    void useGameStore
      .getState()
      .loadOne(gameId)
      .then((game) => {
        if (cancelled) return;
        let restored: unknown[] | null = null;
        if (game?.agent_transcript_enc && session) {
          try {
            const parsed = session.decryptJson<unknown[]>(game.agent_transcript_enc);
            if (Array.isArray(parsed) && parsed.length > 0) restored = parsed;
          } catch {
            /* malformed / wrong key — export without the conversation */
          }
        }
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
  }, [open, gameId, session]);

  const runExport = useCallback(async () => {
    if (!gameId || exporting) return;
    setExporting(true);
    setError(null);
    try {
      // Re-read (forced): studio state lacks ages/duration, and the row may have
      // changed since the list was cached.
      const row = await useGameStore.getState().loadOne(gameId, undefined, true);
      if (!row) throw new Error(t("exportFailedGeneric"));
      const files = buildGameExportFiles({
        game: row,
        transcript: withTranscript && loadedFor === gameId ? transcript : null,
        appVersion: "dodi web",
      });
      downloadBlob(packGameExportZip(files), gameExportFileName(row.title));
      onClose();
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("exportFailed", { reason }) : t("exportFailedGeneric"));
    } finally {
      setExporting(false);
    }
  }, [gameId, exporting, withTranscript, transcript, loadedFor, onClose, t]);

  const hasTranscript = loadedFor === gameId && transcript !== null;

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
        <div className="flex flex-col gap-2">
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2">
            <Switch
              checked={withTranscript && hasTranscript}
              disabled={!hasTranscript}
              onCheckedChange={setWithTranscript}
            />
            {t("exportIncludeTranscript")}
          </label>
          {!hasTranscript && (
            <p className="text-xs text-muted-foreground">
              {t(session ? "exportTranscriptEmpty" : "exportTranscriptLocked")}
            </p>
          )}
        </div>
        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
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
