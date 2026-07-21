"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
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
import { tagStyle } from "@/components/parent/games/tag-style";
import { useTagLabel } from "@/lib/games/tag-label";
import { dodi } from "@/lib/api";
import { unpackGameExportZip } from "@/lib/games/game-export-zip";
import { cn } from "@/lib/utils";
import { useKids } from "@/hooks/use-kids";
import { sealGameCreateFields, useGameStore } from "@/stores/game-store";
import { useVaultStore } from "@/stores/vault-store";
import {
  GameImportError,
  type GameImportErrorCode,
  type ParsedGameExport,
  parseGameExportFiles,
} from "@dodi/games/export";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";
import type { Json } from "@dodi/types/database";

interface GameImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** i18n key (gameStudio ns) for each structured import-error code. */
const ERROR_KEY_BY_CODE: Record<GameImportErrorCode, string> = {
  "archive-too-large": "importErrArchiveTooLarge",
  "archive-invalid": "importErrArchiveInvalid",
  "manifest-missing": "importErrManifest",
  "manifest-invalid": "importErrManifest",
  "unsupported-version": "importErrVersion",
  "code-missing": "importErrCode",
  "invalid-code": "importErrCode",
  "code-too-large": "importErrCodeTooLarge",
  "unsafe-code": "importErrUnsafeCode",
  "background-missing": "importErrBackground",
};

/**
 * Import a `.dodi-game.zip`: unzip + validate entirely in the browser, show a
 * non-executing preview (the game code is never rendered here), then create the
 * game through the normal POST — inactive until the parent reviews it. An
 * included studio conversation is re-sealed under this account's vault key.
 */
export function GameImportDialog({ open, onOpenChange }: GameImportDialogProps) {
  const t = useTranslations("gameStudio");
  const router = useRouter();
  const tagLabel = useTagLabel();
  const { kids } = useKids();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [parsed, setParsed] = useState<ParsedGameExport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isFamily, setIsFamily] = useState(true);
  const [audienceIds, setAudienceIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const kidOptions = (kids ?? []).map((k) => ({ id: k.id, name: k.display_name }));
  const primaryKidId = isFamily
    ? (kidOptions[0]?.id ?? null)
    : (audienceIds[0] ?? null);
  const session = useVaultStore((s) => s.session);

  function reset(): void {
    setParsed(null);
    setParseError(null);
    setIsFamily(true);
    setAudienceIds([]);
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
      setParsed(parseGameExportFiles(unpackGameExportZip(bytes)));
    } catch (error) {
      setParseError(
        error instanceof GameImportError
          ? t(ERROR_KEY_BY_CODE[error.code])
          : t("importErrArchiveInvalid"),
      );
    } finally {
      // Allow re-picking the same file after an error.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleImport(): Promise<void> {
    if (!parsed || !primaryKidId || importing) return;
    setImporting(true);
    setSubmitError(null);
    try {
      const { manifest } = parsed;
      const agentTranscriptEnc =
        parsed.transcript && session ? session.encryptJson(parsed.transcript) : undefined;
      // The archive is hostile input, already sanitized by parseGameExportFiles.
      // Seal everything here: once it is ciphertext no later layer can check it,
      // and an unbuilt archive gets the sealed placeholder rather than nothing.
      const sealed = await sealGameCreateFields({
        title: manifest.title,
        description: manifest.description || undefined,
        markdown: parsed.markdown || undefined,
        codeBundle: parsed.unbuilt ? UNBUILT_GAME_PLACEHOLDER : parsed.codeBundle,
        learningGoal: manifest.learningGoal || undefined,
        successDefinition: manifest.successDefinition || undefined,
        successCriteria: Object.keys(manifest.successCriteria).length
          ? (manifest.successCriteria as unknown as Json)
          : undefined,
      });
      const res = await dodi.request("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kidId: primaryKidId,
          ...sealed,
          tags: parsed.tags,
          progressKind: manifest.progressKind,
          targetAgeMin: manifest.targetAgeMin,
          targetAgeMax: manifest.targetAgeMax,
          estimatedDurationMinutes: manifest.estimatedDurationMinutes,
          metadata: manifest.metadata,
          // Imported code stays inactive until the parent has reviewed it.
          isActive: false,
          agentTranscriptEnc,
          audience: { isFamily, audienceIds },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const created = (await res.json()) as { id: string };
      useGameStore.getState().invalidate();
      handleOpenChange(false);
      router.push(`/parent/game-studio/${created.id}`);
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
              {parsed.backgroundDataUrl && (
                <Image
                  src={parsed.backgroundDataUrl}
                  alt=""
                  width={72}
                  height={72}
                  unoptimized
                  className="h-18 w-18 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink">{manifest.title}</div>
                {manifest.description && (
                  <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
                    {manifest.description}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-faint">
                  {t("importAges", {
                    min: manifest.targetAgeMin,
                    max: manifest.targetAgeMax,
                  })}
                  {" · "}
                  {t("importDuration", { minutes: manifest.estimatedDurationMinutes })}
                  {parsed.unbuilt && <> {" · "} {t("importPreviewUnbuilt")}</>}
                </p>
                {parsed.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {parsed.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-ink-2"
                      >
                        <Icon name={tagStyle(tag).icon} size={12} />
                        {tagLabel(tag)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(parsed.droppedTags.length > 0 ||
              parsed.warnings.length > 0 ||
              parsed.transcript) && (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {parsed.droppedTags.length > 0 && (
                  <p>{t("importDroppedTags", { tags: parsed.droppedTags.join(", ") })}</p>
                )}
                {parsed.transcript && (
                  <p>{t(session ? "importTranscriptIncluded" : "importTranscriptSkipped")}</p>
                )}
                {parsed.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}

            {/* Who can play (studio semantics: family, or specific kids). */}
            <div className="flex flex-wrap gap-2">
              <AudiencePill
                selected={isFamily}
                onClick={() => {
                  setIsFamily(true);
                  setAudienceIds([]);
                }}
                icon
                label={t("family")}
              />
              {kidOptions.map((kid) => (
                <AudiencePill
                  key={kid.id}
                  selected={!isFamily && audienceIds.includes(kid.id)}
                  onClick={() => {
                    setIsFamily(false);
                    setAudienceIds((ids) =>
                      ids.includes(kid.id)
                        ? ids.filter((id) => id !== kid.id)
                        : [...ids, kid.id],
                    );
                  }}
                  initial={kid.name.charAt(0).toUpperCase()}
                  label={kid.name}
                />
              ))}
            </div>

            {!parsed.unbuilt && (
              <p className="text-xs text-muted-foreground">{t("importInactiveNotice")}</p>
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
            disabled={!parsed || !primaryKidId || importing}
          >
            <Icon name="download" size={16} />
            {t("importConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact audience pill (visual twin of the studio's AudienceButton). */
function AudiencePill({
  selected,
  onClick,
  label,
  icon,
  initial,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  icon?: boolean;
  initial?: string;
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
      {icon ? (
        <Icon
          name="friends"
          size={16}
          className={selected ? "text-primary" : "text-muted-foreground"}
        />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
          {initial}
        </span>
      )}
      {label}
      {selected && <Icon name="check" size={14} strokeWidth={3} />}
    </button>
  );
}
