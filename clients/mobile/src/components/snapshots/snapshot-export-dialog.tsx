import { useState } from "react";
import { useTranslations } from "use-intl";
import type { AccountSnapshot } from "@dodi/client-state/snapshots";
import { buildSnapshotExportArchive } from "@dodi/client-state/snapshot-transfer";

import { shareGameArchive } from "@/adapters/game-archive-files";
import { FormAlert } from "@/components/games-library/form-alert";
import { Button, Dialog } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";
import { snapshotDeps } from "@/lib/snapshots";
import { useKids } from "@/lib/use-kids";

/**
 * Export a snapshot as a portable `.dodi-snap.zip` (web: parent/snapshots/
 * snapshot-export-dialog). The payload is fetched and decrypted on the device
 * (received rows with the kid's friend keys), zipped here and handed to the
 * OS share sheet instead of the web's download: the server never sees it.
 */
export function SnapshotExportDialog({
  isOpen,
  snapshot,
  onClose,
}: {
  isOpen: boolean;
  /** Stays set while the dialog closes, so the content doesn't blank out. */
  snapshot: AccountSnapshot | null;
  onClose: () => void;
}) {
  const t = useTranslations("parentSnapshots");
  const { kids } = useKids();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runExport(): Promise<void> {
    if (!snapshot?.info || isExporting) return;
    const session = useVaultStore.getState().session;
    if (!session) {
      setError(t("exportFailedGeneric"));
      return;
    }
    setIsExporting(true);
    setError(null);
    try {
      const kid = (kids ?? []).find((k) => k.id === snapshot.kidId) ?? null;
      const archive = await buildSnapshotExportArchive(snapshotDeps, {
        snapshot,
        kid,
        session,
        appVersion: "dodi app",
      });
      await shareGameArchive(archive.bytes, archive.fileName);
      onClose();
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("exportFailed", { reason }) : t("exportFailedGeneric"));
    } finally {
      setIsExporting(false);
    }
  }

  function close(): void {
    if (isExporting) return;
    setError(null);
    onClose();
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      title={t("exportTitle")}
      description={t("exportDescription")}
      footer={
        <>
          <Button icon="download" isLoading={isExporting} onPress={() => void runExport()}>
            {t("exportConfirm")}
          </Button>
          <Button variant="outline" disabled={isExporting} onPress={close}>
            {t("exportCancel")}
          </Button>
        </>
      }
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}
