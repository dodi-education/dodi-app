import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
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
import { dialogField, importPreview } from "@dodi/ui-recipes";

import { pickGameArchive } from "@/adapters/game-archive-files";
import { Button, Dialog, Text } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";
import { gameFlowDeps } from "@/lib/game-flow-deps";
import { useKids } from "@/lib/use-kids";

import { AudiencePill, AudiencePillRow } from "./audience-pill";
import { FormAlert } from "./form-alert";
import { ImportPreviewCard } from "./import-preview-card";

/**
 * Import a `.dodi-game.zip` (web: game-import-dialog): the OS document picker
 * stands in for the web's file input; unzip + validate on the device, show a
 * non-executing preview, then create the game (inactive until reviewed). An
 * included studio conversation is re-sealed under this account's vault key.
 */
export function GameImportDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useTranslations("gameStudio");
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { kids } = useKids();
  const session = useVaultStore((s) => s.session);

  const [parsed, setParsed] = useState<ParsedGameExport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [audience, setAudience] = useState<AudienceSelection>(selectFamilyAudience);
  const [isImporting, setIsImporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const kidOptions = (kids ?? []).map((k) => ({ id: k.id, name: k.display_name }));
  const primaryKidId = importPrimaryKidId(audience, kidOptions.map((k) => k.id));

  function close(): void {
    setParsed(null);
    setParseError(null);
    setAudience(selectFamilyAudience());
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
      setParsed(null);
      setParsed(parseGameImportArchive(bytes));
    } catch (error) {
      setParseError(t(importErrorKey(error)));
    }
  }

  async function runImport(): Promise<void> {
    if (!parsed || !primaryKidId || isImporting) return;
    setIsImporting(true);
    setSubmitError(null);
    try {
      // The archive is hostile input, already sanitized by the parse; the
      // import seals everything (and re-seals an included conversation).
      const createdId = await importGame(gameFlowDeps(), { parsed, kidId: primaryKidId, audience });
      close();
      router.push(`/parent/game-studio/${createdId}` as Href);
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "";
      setSubmitError(reason ? t("importFailed", { reason }) : t("importFailedGeneric"));
      setIsImporting(false);
    }
  }

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
            disabled={!parsed || !primaryKidId}
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
      {!parsed ? (
        <View className={importPreview.picker}>
          <Button variant="outline" size="lg" icon="upload" onPress={() => void pickFile()}>
            {t("importSelectFile")}
          </Button>
          {parseError ? <FormAlert>{parseError}</FormAlert> : null}
        </View>
      ) : (
        <ScrollView style={{ maxHeight: height * 0.5 }} keyboardShouldPersistTaps="handled">
          <View className={importPreview.body}>
            <ImportPreviewCard parsed={parsed} />

            {parsed.droppedTags.length > 0 || parsed.warnings.length > 0 || parsed.transcript ? (
              <View className={importPreview.notes}>
                {parsed.droppedTags.length > 0 ? (
                  <Text className={importPreview.notesText}>
                    {t("importDroppedTags", { tags: parsed.droppedTags.join(", ") })}
                  </Text>
                ) : null}
                {parsed.transcript ? (
                  <Text className={importPreview.notesText}>
                    {t(session ? "importTranscriptIncluded" : "importTranscriptSkipped")}
                  </Text>
                ) : null}
                {parsed.warnings.map((warning) => (
                  <Text key={warning} className={importPreview.notesText}>
                    {warning}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Who can play (studio semantics: family, or specific kids). */}
            <AudiencePillRow>
              <AudiencePill
                isSelected={audience.isFamily}
                onPress={() => setAudience(selectFamilyAudience())}
                hasIcon
                label={t("family")}
              />
              {kidOptions.map((kid) => (
                <AudiencePill
                  key={kid.id}
                  isSelected={isAudienceKidSelected(audience, kid.id)}
                  onPress={() => setAudience((current) => toggleAudienceKid(current, kid.id))}
                  initial={kid.name.charAt(0).toUpperCase()}
                  label={kid.name}
                />
              ))}
            </AudiencePillRow>

            {!parsed.unbuilt ? <Text className={dialogField.note}>{t("importInactiveNotice")}</Text> : null}
            {kidOptions.length === 0 ? <FormAlert>{t("importNeedsKid")}</FormAlert> : null}
            {submitError ? <FormAlert>{submitError}</FormAlert> : null}

            <Pressable
              accessibilityRole="button"
              hitSlop={14}
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
