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
import { gameFlowDeps } from "@/lib/games/game-flow-deps";
import { cn } from "@/lib/utils";
import { useKids } from "@/hooks/use-kids";
import { useVaultStore } from "@/stores/vault-store";
import {
  type AudienceSelection,
  isAudienceKidSelected,
  selectFamilyAudience,
  toggleAudienceKid,
} from "@dodi/client-state/game-sharing";
import {
  importErrorKey,
  importGame,
  importPrimaryKidId,
  parseGameImportArchive,
} from "@dodi/client-state/game-transfer";
import type { ParsedGameExport } from "@dodi/games/export";
import { audiencePill, dialogField, formAlert, importPreview } from "@dodi/ui-recipes";

interface GameImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
  const [audience, setAudience] = useState<AudienceSelection>(selectFamilyAudience);
  const [importing, setImporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const kidOptions = (kids ?? []).map((k) => ({ id: k.id, name: k.display_name }));
  const primaryKidId = importPrimaryKidId(
    audience,
    kidOptions.map((k) => k.id),
  );
  const session = useVaultStore((s) => s.session);

  function reset(): void {
    setParsed(null);
    setParseError(null);
    setAudience(selectFamilyAudience());
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
      setParsed(parseGameImportArchive(bytes));
    } catch (error) {
      setParseError(t(importErrorKey(error)));
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
      // The archive is hostile input, already sanitized by the parse; the
      // import seals everything (and re-seals an included conversation).
      const createdId = await importGame(gameFlowDeps(), {
        parsed,
        kidId: primaryKidId,
        audience,
      });
      handleOpenChange(false);
      router.push(`/parent/game-studio/${createdId}`);
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "";
      setSubmitError(reason ? t("importFailed", { reason }) : t("importFailedGeneric"));
    } finally {
      setImporting(false);
    }
  }

  const manifest = parsed?.manifest ?? null;
  // Card thumbnail: the archive's list preview, else its background image.
  const thumb = parsed ? (parsed.previewImageDataUrl ?? parsed.backgroundDataUrl) : null;

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
          <div className={cn(importPreview.webBody, importPreview.picker)}>
            <Button
              variant="outline"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="upload" size={16} />
              {t("importSelectFile")}
            </Button>
            {parseError && (
              <div className={cn(formAlert.box, formAlert.text)}>
                {parseError}
              </div>
            )}
          </div>
        ) : manifest ? (
          <div className={cn(importPreview.webBody, importPreview.body)}>
            {/* Non-executing preview — the game code is never rendered here. */}
            <div className={cn(importPreview.webCard, importPreview.card)}>
              {thumb && (
                <Image
                  src={thumb}
                  alt=""
                  width={72}
                  height={72}
                  unoptimized
                  className={cn(importPreview.thumb, importPreview.webThumb)}
                />
              )}
              <div className={importPreview.main}>
                <div className={cn(importPreview.webTitle, importPreview.title)}>{manifest.title}</div>
                {manifest.description && (
                  <p className={cn(importPreview.description, importPreview.webDescription)}>
                    {manifest.description}
                  </p>
                )}
                <p className={importPreview.meta}>
                  {t("importAges", {
                    min: manifest.targetAgeMin,
                    max: manifest.targetAgeMax,
                  })}
                  {" · "}
                  {t("importDuration", { minutes: manifest.estimatedDurationMinutes })}
                  {parsed.unbuilt && <> {" · "} {t("importPreviewUnbuilt")}</>}
                </p>
                {parsed.tags.length > 0 && (
                  <div className={cn(importPreview.webTags, importPreview.tags)}>
                    {parsed.tags.map((tag) => (
                      <span
                        key={tag}
                        className={cn(importPreview.webTag, importPreview.tag, importPreview.tagText)}
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
              <div className={cn(importPreview.webNotes, importPreview.notes, importPreview.notesText)}>
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
            <div className={cn(audiencePill.webRow, audiencePill.row)}>
              <AudiencePill
                selected={audience.isFamily}
                onClick={() => setAudience(selectFamilyAudience())}
                icon
                label={t("family")}
              />
              {kidOptions.map((kid) => (
                <AudiencePill
                  key={kid.id}
                  selected={isAudienceKidSelected(audience, kid.id)}
                  onClick={() =>
                    setAudience((current) => toggleAudienceKid(current, kid.id))
                  }
                  initial={kid.name.charAt(0).toUpperCase()}
                  label={kid.name}
                />
              ))}
            </div>

            {!parsed.unbuilt && (
              <p className={dialogField.note}>{t("importInactiveNotice")}</p>
            )}
            {kidOptions.length === 0 && (
              <div className={cn(formAlert.box, formAlert.text)}>
                {t("importNeedsKid")}
              </div>
            )}
            {submitError && (
              <div className={cn(formAlert.box, formAlert.text)}>
                {submitError}
              </div>
            )}

            <button
              type="button"
              className={cn(importPreview.another, importPreview.webAnother)}
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
        audiencePill.web,
        audiencePill.box,
        audiencePill.text,
        selected
          ? cn(audiencePill.selected, audiencePill.selectedText)
          : cn(audiencePill.idle, audiencePill.idleText, audiencePill.webIdle),
      )}
    >
      {icon ? (
        <Icon
          name="friends"
          size={16}
          className={selected ? "text-primary" : "text-muted-foreground"}
        />
      ) : (
        <span className={cn(audiencePill.webInitial, audiencePill.initial, audiencePill.initialText)}>
          {initial}
        </span>
      )}
      {label}
      {selected && <Icon name="check" size={14} strokeWidth={3} />}
    </button>
  );
}
