"use client";

/**
 * Export a snapshot as a portable `.dodi-snap.zip` (visual twin of the game
 * export dialog). Assembled entirely in the browser: the heavy payload blob is
 * fetched on confirm and decrypted here — own/autosave rows under the vault,
 * received rows via the kid's friend keys — so the server never sees an
 * archive. The archive records the kid's name so an import elsewhere can
 * suggest the matching kid.
 */
import { useCallback, useState } from "react";
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
import { ensureFriendKeys } from "@/lib/friends";
import { downloadBlob } from "@/lib/games/game-export-zip";
import { packSnapshotExportZip } from "@/lib/snapshot-export-zip";
import { decodeSnapshotPayload, fetchSnapshot } from "@/lib/snapshots";
import { useKids } from "@/hooks/use-kids";
import type { AccountSnapshot } from "@/hooks/use-account-snapshots";
import { useVaultStore } from "@/stores/vault-store";
import {
  buildSnapshotExportFiles,
  snapshotExportFileName,
} from "@dodi/protocol/snapshot-export";

interface SnapshotExportDialogProps {
  open: boolean;
  /** Stays set while the dialog animates closed, so the content doesn't blank out. */
  snapshot: AccountSnapshot | null;
  onClose: () => void;
}

export function SnapshotExportDialog({
  open,
  snapshot,
  onClose,
}: SnapshotExportDialogProps) {
  const t = useTranslations("parentSnapshots");
  const { kids } = useKids();

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runExport = useCallback(async () => {
    if (!snapshot?.info || exporting) return;
    const session = useVaultStore.getState().session;
    if (!session) {
      setError(t("exportFailedGeneric"));
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const detail = await fetchSnapshot(snapshot.view.id);
      // Received rows are sealed to the kid's friend KEM key, not the vault.
      const kid = (kids ?? []).find((k) => k.id === snapshot.kidId);
      const kidKeys =
        detail.origin === "received" && kid
          ? await ensureFriendKeys(kid, session)
          : null;
      const { payload, sanitizedCode } = decodeSnapshotPayload(
        detail,
        session,
        kidKeys,
      );
      const files = buildSnapshotExportFiles({
        info: snapshot.info,
        payload: { ...payload, codeBundle: sanitizedCode },
        kidName: snapshot.kidName,
        appVersion: "dodi web",
      });
      downloadBlob(
        packSnapshotExportZip(files),
        snapshotExportFileName(payload.title),
      );
      setError(null);
      onClose();
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("exportFailed", { reason }) : t("exportFailedGeneric"));
    } finally {
      setExporting(false);
    }
  }, [snapshot, exporting, kids, onClose, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !exporting) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exportTitle")}</DialogTitle>
          <DialogDescription>{t("exportDescription")}</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            {t("exportCancel")}
          </Button>
          <Button onClick={() => void runExport()} disabled={exporting}>
            <Icon name="download" size={16} />
            {t("exportConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
