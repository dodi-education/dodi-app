import { useState } from "react";
import { Image, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  importSnapshot,
  parseSnapshotImportArchive,
  snapshotImportErrorKey,
  suggestImportKidId,
} from "@dodi/client-state/snapshot-transfer";
import type { ParsedSnapshotExport } from "@dodi/protocol/snapshot-export";
import { dialogField, importPreview, parentSnapshotRow } from "@dodi/ui-recipes";

import { pickGameArchive } from "@/adapters/game-archive-files";
import { AudiencePill, AudiencePillRow } from "@/components/games-library/audience-pill";
import { FormAlert } from "@/components/games-library/form-alert";
import { Button, Dialog, Icon, Text } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";
import { snapshotDeps } from "@/lib/snapshots";
import { useKids } from "@/lib/use-kids";

/**
 * Import a `.dodi-snap.zip` (web: parent/snapshots/snapshot-import-dialog):
 * the OS document picker stands in for the file input; unzip + validate on
 * the device, show a non-executing preview (the game code is never rendered),
 * then re-seal both blobs under THIS account's vault as an own snapshot of the
 * chosen kid (the same-named kid is preselected).
 */
export function SnapshotImportDialog({
  isOpen,
  onClose,
  onImported,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** The list refetches through this after a successful import. */
  onImported: () => void;
}) {
  const t = useTranslations("parentSnapshots");
  const { formatDateTime } = useAccountDateFormat();
  const { height } = useWindowDimensions();
  const { kids } = useKids();
  const session = useVaultStore((s) => s.session);

  const [parsed, setParsed] = useState<ParsedSnapshotExport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [kidId, setKidId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const kidOptions = (kids ?? []).map((k) => ({ id: k.id, name: k.display_name }));

  function close(): void {
    setParsed(null);
    setParseError(null);
    setKidId(null);
    setIsImporting(false);
    setSubmitError(null);
    onClose();
  }

  async function pickFile(): Promise<void> {
    setParseError(null);
    setSubmitError(null);
    try {
      const bytes = await pickGameArchive();
      if (!bytes) return;
      const next = parseSnapshotImportArchive(bytes);
      setParsed(next);
      setKidId(suggestImportKidId(next, kidOptions));
    } catch (error) {
      setParsed(null);
      setParseError(t(snapshotImportErrorKey(error) as "importErrArchiveInvalid"));
    }
  }

  async function runImport(): Promise<void> {
    if (!parsed || !kidId || isImporting) return;
    if (!session) {
      setSubmitError(t("importLocked"));
      return;
    }
    setIsImporting(true);
    setSubmitError(null);
    try {
      // Hostile input, already validated + sanitized by the parse; sealed here.
      await importSnapshot(snapshotDeps, { parsed, kidId, session });
      onImported();
      close();
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "";
      setSubmitError(reason ? t("importFailed", { reason }) : t("importFailedGeneric"));
      setIsImporting(false);
    }
  }

  const manifest = parsed?.manifest ?? null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isImporting) close();
      }}
      title={t("importTitle")}
      description={t("importDescription")}
      footer={
        <>
          <Button
            icon="download"
            isLoading={isImporting}
            disabled={!parsed || !kidId}
            onPress={() => void runImport()}
          >
            {t("importConfirm")}
          </Button>
          <Button variant="outline" disabled={isImporting} onPress={close}>
            {t("importCancel")}
          </Button>
        </>
      }
    >
      {!parsed || !manifest ? (
        <View className={importPreview.picker}>
          <Button variant="outline" size="lg" icon="upload" onPress={() => void pickFile()}>
            {t("importSelectFile")}
          </Button>
          {parseError ? <FormAlert>{parseError}</FormAlert> : null}
        </View>
      ) : (
        <ScrollView style={{ maxHeight: height * 0.5 }} keyboardShouldPersistTaps="handled">
          <View className={importPreview.body}>
            {/* Non-executing preview: the game code is never rendered here. */}
            <View className={importPreview.card}>
              {parsed.info.thumbnail ? (
                <Image
                  source={{ uri: parsed.info.thumbnail }}
                  className={importPreview.thumb}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View className={parentSnapshotRow.importTile}>
                  <Icon name="camera" size={26} stroke={1.6} color="primary" />
                </View>
              )}
              <View className={cn(importPreview.main, "flex-1")}>
                <Text className={importPreview.title} numberOfLines={1}>
                  {manifest.title}
                </Text>
                {manifest.gameTitle ? (
                  <Text className={importPreview.description} numberOfLines={1}>
                    {manifest.gameTitle}
                  </Text>
                ) : null}
                <Text className={importPreview.meta}>
                  {t("importSavedBy", { name: manifest.kidName })}
                  {" · "}
                  {formatDateTime(manifest.createdAt)}
                </Text>
              </View>
            </View>

            {parsed.warnings.length > 0 ? (
              <View className={importPreview.notes}>
                {parsed.warnings.map((warning) => (
                  <Text key={warning} className={importPreview.notesText}>
                    {warning}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Which kid keeps the snapshot (name-matched kid preselected). */}
            {kidOptions.length > 0 ? (
              <View className={dialogField.box}>
                <Text className={dialogField.label}>{t("importKidLabel")}</Text>
                <AudiencePillRow>
                  {kidOptions.map((kid) => (
                    <AudiencePill
                      key={kid.id}
                      isSelected={kidId === kid.id}
                      onPress={() => setKidId(kid.id)}
                      initial={kid.name.charAt(0).toUpperCase()}
                      label={kid.name}
                    />
                  ))}
                </AudiencePillRow>
              </View>
            ) : (
              <FormAlert>{t("importNeedsKid")}</FormAlert>
            )}
            {submitError ? <FormAlert>{submitError}</FormAlert> : null}

            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              className="self-start"
              onPress={() => {
                setParsed(null);
                setParseError(null);
                setSubmitError(null);
              }}
            >
              <Text className={importPreview.another}>{t("importAnotherFile")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </Dialog>
  );
}
