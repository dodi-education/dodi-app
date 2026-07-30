"use client";

import Image from "next/image";
import { useRef, useState } from "react";
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
import { useDateFormat } from "@/components/providers/date-format-provider";
import { unpackSnapshotExportZip } from "@/lib/snapshot-export-zip";
import { createOwnSnapshot } from "@/lib/snapshots";
import { cn } from "@/lib/utils";
import { useKids } from "@/hooks/use-kids";
import { useVaultStore } from "@/stores/vault-store";
import {
  estimateSnapshotPayloadBytes,
  sealOwnSnapshotInfo,
  sealOwnSnapshotPayload,
} from "@dodi/protocol";
import {
  SnapshotImportError,
  type SnapshotImportErrorCode,
  type ParsedSnapshotExport,
  matchKidByName,
  parseSnapshotExportFiles,
} from "@dodi/protocol/snapshot-export";

interface SnapshotImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The list refetches through this after a successful import. */
  onImported: () => void;
}

/** i18n key (parentSnapshots ns) for each structured import-error code. */
const ERROR_KEY_BY_CODE: Record<SnapshotImportErrorCode, string> = {
  "archive-too-large": "importErrArchiveTooLarge",
  "archive-invalid": "importErrArchiveInvalid",
  "manifest-missing": "importErrManifest",
  "manifest-invalid": "importErrManifest",
  "unsupported-version": "importErrVersion",
  "code-missing": "importErrCode",
  "unsafe-code": "importErrUnsafeCode",
  "state-missing": "importErrState",
  "state-invalid": "importErrState",
  "payload-invalid": "importErrPayload",
};

/**
 * Import a `.dodi-snap.zip` (visual twin of the game import dialog): unzip +
 * validate entirely in the browser, show a non-executing preview (the game
 * code is never rendered here), then re-seal both blobs under THIS account's
 * vault key and store them as an own snapshot of the chosen kid. Works across
 * accounts by design — the archive carries no ids, only the exporting kid's
 * name, which preselects the same-named kid here (e.g. Emma → Emma).
 */
export function SnapshotImportDialog({
  open,
  onOpenChange,
  onImported,
}: SnapshotImportDialogProps) {
  const t = useTranslations("parentSnapshots");
  const { formatDateTime } = useDateFormat();
  const { kids } = useKids();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [parsed, setParsed] = useState<ParsedSnapshotExport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [kidId, setKidId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const kidOptions = (kids ?? []).map((k) => ({ id: k.id, name: k.display_name }));
  const session = useVaultStore((s) => s.session);

  function reset(): void {
    setParsed(null);
    setParseError(null);
    setKidId(null);
    setImporting(false);
    setSubmitError(null);
  }

  function handleOpenChange(next: boolean): void {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFileSelect(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    setParsed(null);
    setParseError(null);
    setSubmitError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const next = parseSnapshotExportFiles(unpackSnapshotExportZip(bytes));
      setParsed(next);
      // Suggest the same-named kid; a single-kid account needs no choosing.
      setKidId(
        matchKidByName(next.manifest.kidName, kidOptions) ??
          (kidOptions.length === 1 ? kidOptions[0].id : null),
      );
    } catch (error) {
      setParseError(
        error instanceof SnapshotImportError
          ? t(ERROR_KEY_BY_CODE[error.code])
          : t("importErrArchiveInvalid"),
      );
    } finally {
      // Allow re-picking the same file after an error.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleImport(): Promise<void> {
    if (!parsed || !kidId || importing) return;
    if (!session) {
      setSubmitError(t("importLocked"));
      return;
    }
    setImporting(true);
    setSubmitError(null);
    try {
      // The archive is hostile input, already validated + sanitized by
      // parseSnapshotExportFiles. Seal here: once it is ciphertext no later
      // layer can check it.
      await createOwnSnapshot({
        kidId,
        // The soft game reference never crosses accounts; the payload is
        // self-contained, so the snapshot plays without the source game.
        gameId: null,
        infoEnc: sealOwnSnapshotInfo(session, parsed.info),
        payloadEnc: sealOwnSnapshotPayload(session, parsed.payload),
        payloadBytes: estimateSnapshotPayloadBytes(parsed.payload),
      });
      onImported();
      handleOpenChange(false);
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "";
      setSubmitError(reason ? t("importFailed", { reason }) : t("importFailedGeneric"));
    } finally {
      setImporting(false);
    }
  }

  const manifest = parsed?.manifest ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importDescription")}</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => void handleFileSelect(e.target.files)}
        />

        {!parsed ? (
          <div className="flex flex-col gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="upload" size={16} />
              {t("importSelectFile")}
            </Button>
            {parseError && (
              <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
                {parseError}
              </div>
            )}
          </div>
        ) : manifest ? (
          <div className="flex flex-col gap-4">
            {/* Non-executing preview — the game code is never rendered here. */}
            <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
              {parsed.info.thumbnail ? (
                <Image
                  src={parsed.info.thumbnail}
                  alt=""
                  width={72}
                  height={72}
                  unoptimized
                  className="h-18 w-18 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon name="camera" size={26} stroke={1.6} />
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink">
                  {manifest.title}
                </div>
                {manifest.gameTitle && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {manifest.gameTitle}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-faint">
                  {t("importSavedBy", { name: manifest.kidName })}
                  {" · "}
                  {formatDateTime(manifest.createdAt)}
                </p>
              </div>
            </div>

            {parsed.warnings.length > 0 && (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {parsed.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}

            {/* Which kid keeps the snapshot (name-matched kid preselected). */}
            {kidOptions.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-ink-2">{t("importKidLabel")}</p>
                <div className="flex flex-wrap gap-2">
                  {kidOptions.map((kid) => (
                    <KidPill
                      key={kid.id}
                      selected={kidId === kid.id}
                      onClick={() => setKidId(kid.id)}
                      name={kid.name}
                    />
                  ))}
                </div>
              </div>
            )}

            {kidOptions.length === 0 && (
              <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
                {t("importNeedsKid")}
              </div>
            )}
            {submitError && (
              <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
                {submitError}
              </div>
            )}

            <button
              type="button"
              className="w-fit text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-ink-2"
              onClick={() => {
                setParsed(null);
                setParseError(null);
                setSubmitError(null);
              }}
            >
              {t("importAnotherFile")}
            </button>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("importCancel")}
          </Button>
          <Button
            onClick={() => void handleImport()}
            disabled={!parsed || !kidId || importing}
          >
            <Icon name="download" size={16} />
            {t("importConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact kid pill (visual twin of the game import dialog's AudiencePill). */
function KidPill({
  selected,
  onClick,
  name,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
        selected
          ? "border-primary bg-primary-soft text-primary"
          : "border-border-strong bg-card text-ink-2 hover:border-faint",
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
        {name.charAt(0).toUpperCase()}
      </span>
      {name}
      {selected && <Icon name="check" size={14} strokeWidth={3} />}
    </button>
  );
}
