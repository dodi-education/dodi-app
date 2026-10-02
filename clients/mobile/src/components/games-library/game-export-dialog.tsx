import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type GameExportSource,
  GameExportLoadError,
  buildGameExportArchive,
  loadExportTranscript,
} from "@dodi/client-state/game-transfer";
import { dialogField, exportOption } from "@dodi/ui-recipes";

import { shareGameArchive } from "@/adapters/game-archive-files";
import { Button, Dialog, Switch, Text } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";
import { gameFlowDeps } from "@/lib/game-flow-deps";

import { FormAlert } from "./form-alert";

/**
 * Export a game as a portable `.dodi-game.zip` (web: game-export-dialog). The
 * archive is built on the device (`owned`: from the decrypted vault cache,
 * the conversation opt-in; `discover`: the plaintext published game) and
 * handed to the OS share sheet instead of the web's download.
 */
export function GameExportDialog({
  isOpen,
  gameId,
  onClose,
  source = "owned",
}: {
  isOpen: boolean;
  /** Stays set while the dialog closes, so the content doesn't blank out. */
  gameId: string | null;
  onClose: () => void;
  source?: GameExportSource;
}) {
  const t = useTranslations("gameStudio");
  const session = useVaultStore((s) => s.session);

  const [isTranscriptIncluded, setIsTranscriptIncluded] = useState(false);
  const [transcript, setTranscript] = useState<unknown[] | null>(null);
  /** Which game `transcript` belongs to. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discover exports have no parent conversation: reset on each open.
  const discoverOpenFor = isOpen && gameId && source === "discover" ? gameId : null;
  const [prevDiscoverOpenFor, setPrevDiscoverOpenFor] = useState<string | null>(null);
  if (discoverOpenFor !== prevDiscoverOpenFor) {
    setPrevDiscoverOpenFor(discoverOpenFor);
    if (discoverOpenFor) {
      setTranscript(null);
      setIsTranscriptIncluded(false);
      setError(null);
      setLoadedFor(discoverOpenFor);
    }
  }

  // Owned only: unseal the stored conversation so the switch can say whether there is one.
  useEffect(() => {
    if (!isOpen || !gameId || source !== "owned") return;
    let isCurrent = true;
    void loadExportTranscript(gameFlowDeps(), gameId)
      .then((restored) => {
        if (!isCurrent) return;
        setTranscript(restored);
        setIsTranscriptIncluded(false);
        setError(null);
        setLoadedFor(gameId);
      })
      .catch(() => {
        if (isCurrent) setLoadedFor(gameId);
      });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, gameId, session, source]);

  async function runExport(): Promise<void> {
    if (!gameId || isExporting) return;
    setIsExporting(true);
    setError(null);
    try {
      const archive = await buildGameExportArchive(gameFlowDeps(), {
        gameId,
        source,
        transcript: isTranscriptIncluded && loadedFor === gameId ? transcript : null,
        appVersion: "dodi app",
      });
      await shareGameArchive(archive.bytes, archive.fileName);
      onClose();
    } catch (e) {
      const reason =
        e instanceof GameExportLoadError ? "" : e instanceof Error && e.message ? e.message : "";
      setError(reason ? t("exportFailed", { reason }) : t("exportFailedGeneric"));
    } finally {
      setIsExporting(false);
    }
  }

  const hasTranscript = source === "owned" && loadedFor === gameId && transcript !== null;
  const isChecked = isTranscriptIncluded && hasTranscript;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!isExporting) onClose();
      }}
      title={t("exportTitle")}
      description={t("exportDescription")}
      footer={
        <>
          <Button icon="download" isLoading={isExporting} onPress={() => void runExport()}>
            {t("exportConfirm")}
          </Button>
          <Button variant="outline" disabled={isExporting} onPress={onClose}>
            {t("exportCancel")}
          </Button>
        </>
      }
    >
      {source === "owned" ? (
        <View className={exportOption.group}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isChecked, disabled: !hasTranscript }}
            disabled={!hasTranscript}
            onPress={() => setIsTranscriptIncluded(!isTranscriptIncluded)}
            className={exportOption.box}
          >
            <Switch
              checked={isChecked}
              disabled={!hasTranscript}
              onCheckedChange={setIsTranscriptIncluded}
              accessibilityLabel={t("exportIncludeTranscript")}
            />
            <Text className={exportOption.text}>{t("exportIncludeTranscript")}</Text>
          </Pressable>
          {!hasTranscript ? (
            <Text className={dialogField.note}>
              {t(session ? "exportTranscriptEmpty" : "exportTranscriptLocked")}
            </Text>
          ) : null}
        </View>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}
