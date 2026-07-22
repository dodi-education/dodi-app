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
import { dodi } from "@/lib/api";
import { downloadBlob, packGameExportZip } from "@/lib/games/game-export-zip";
import { useGameStore } from "@/stores/game-store";
import { useVaultStore } from "@/stores/vault-store";
import {
  buildGameExportFiles,
  gameExportFileName,
  type ExportableGame,
} from "@dodi/games/export";
import type { DiscoverGameDetail } from "@dodi/types/games";

export type GameExportSource = "owned" | "discover";

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

  // Owned only: unseal the stored conversation so the toggle can say whether
  // there is one. Discover exports have no parent conversation.
  useEffect(() => {
    if (!open || !gameId || source !== "owned") {
      if (open && gameId && source === "discover") {
        setTranscript(null);
        setWithTranscript(false);
        setError(null);
        setLoadedFor(gameId);
      }
      return;
    }
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
  }, [open, gameId, session, source]);

  const runExport = useCallback(async () => {
    if (!gameId || exporting) return;
    setExporting(true);
    setError(null);
    try {
      let row: ExportableGame | null = null;
      if (source === "discover") {
        const res = await dodi.request(`/api/discover/games/${gameId}`);
        if (!res.ok) throw new Error(t("exportFailedGeneric"));
        const detail = (await res.json()) as DiscoverGameDetail;
        row = detailToExportable(detail);
      } else {
        // Re-read (forced): studio state lacks ages/duration, and the row may have
        // changed since the list was cached.
        row = await useGameStore.getState().loadOne(gameId, undefined, true);
      }
      if (!row) throw new Error(t("exportFailedGeneric"));
      const files = buildGameExportFiles({
        game: row,
        transcript:
          source === "owned" && withTranscript && loadedFor === gameId
            ? transcript
            : null,
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
        )}
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

function detailToExportable(detail: DiscoverGameDetail): ExportableGame {
  return {
    title: detail.title,
    description: detail.description,
    tags: detail.tags,
    learning_goal: detail.learning_goal,
    success_definition: detail.success_definition,
    success_criteria: detail.success_criteria,
    progress_kind: detail.progress_kind,
    target_age_min: detail.target_age_min,
    target_age_max: detail.target_age_max,
    estimated_duration_minutes: detail.estimated_duration_minutes,
    code_bundle: detail.code_bundle,
    markdown: detail.markdown,
    metadata: detail.metadata,
    preview_image: detail.preview_image,
  };
}
