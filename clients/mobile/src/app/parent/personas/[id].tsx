import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { flowErrorText } from "@dodi/client-state/flow-error";
import {
  PERSONA_NAME_MAX_LENGTH,
  cloneNameOf,
  clonePersona,
  deletePersona,
  invalidPersonaFields,
  loadPersona,
  soulFileName,
  updatePersona,
} from "@dodi/client-state/personas";
import type { Persona } from "@dodi/types/database";
import { sectionFormError, soulActions } from "@dodi/ui-recipes";

import { shareSoulFile } from "@/adapters/soul-files";
import { PageMessage } from "@/components/parent/page-message";
import { SoulPreview } from "@/components/personas/soul-preview";
import { SoulTextarea } from "@/components/personas/soul-textarea";
import { FieldRow, Row, RowMain, RowMeta, RowTitle, StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { PageActions, Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Badge, Button, Dialog, Input, Text } from "@/components/ui";
import { useBreadcrumbStore } from "@/lib/breadcrumb-store";
import { parentFlowDeps } from "@/lib/parent-flow-deps";

/**
 * One persona (web: parent/personas/[id]/page). The built-in default is
 * read-only (export or clone it); an account persona's name and soul are
 * edited here and sealed on the device. Export goes through the OS share
 * sheet (web: a .soul.md download), from the already-decrypted soul.
 */
export default function PersonaDetailScreen() {
  const t = useTranslations("personas");
  const tc = useTranslations("common");
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [name, setName] = useState("");
  const [soul, setSoul] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [isCloneShown, setIsCloneShown] = useState(false);
  const [isNameInvalid, setIsNameInvalid] = useState(false);
  const [isSoulInvalid, setIsSoulInvalid] = useState(false);
  const [isCloneNameInvalid, setIsCloneNameInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    async function load(): Promise<void> {
      // Account personas store `name`/`soul` as ciphertext; decrypted for editing.
      const loaded = await loadPersona(parentFlowDeps(), id).catch(() => null);
      if (isCancelled) return;
      if (!loaded) {
        setError(t("notFound"));
        setIsFetching(false);
        return;
      }
      setPersona(loaded);
      setName(loaded.name);
      setSoul(loaded.soul);
      setIsFetching(false);
    }
    void load();
    return () => {
      isCancelled = true;
    };
  }, [id, t]);

  // The (decrypted, live-edited) name is the breadcrumb leaf.
  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    if (persona) setLeaf(name.trim() || null);
    return () => setLeaf(null);
  }, [persona, name, setLeaf]);

  async function handleUpdate(): Promise<void> {
    setError(null);
    const nextInvalid = invalidPersonaFields({ name, soul });
    if (nextInvalid.name || nextInvalid.soul) {
      setIsNameInvalid(nextInvalid.name);
      setIsSoulInvalid(nextInvalid.soul);
      return;
    }
    setIsLoading(true);
    try {
      await updatePersona(parentFlowDeps(), id, { name, soul });
    } catch (err) {
      setError(flowErrorText(err, t("failedToUpdate"), { tooLong: t("soulTooLong"), vaultLocked: t("failedToUpdate") }));
      setIsLoading(false);
      return;
    }
    router.replace("/parent/personas" as Href);
  }

  async function handleClone(): Promise<void> {
    setError(null);
    if (!cloneName.trim()) {
      setIsCloneNameInvalid(true);
      return;
    }
    setIsLoading(true);
    try {
      await clonePersona(parentFlowDeps(), { name: cloneName, soul });
    } catch (err) {
      setError(flowErrorText(err, t("failedToClone"), { vaultLocked: t("failedToClone") }));
      setIsLoading(false);
      return;
    }
    router.replace("/parent/personas" as Href);
  }

  async function handleDelete(): Promise<void> {
    setIsConfirmingDelete(false);
    try {
      await deletePersona(parentFlowDeps(), id);
    } catch {
      setError(t("failedToDelete"));
      return;
    }
    router.replace("/parent/personas" as Href);
  }

  function handleExport(): void {
    // The server only holds ciphertext for account personas; export the decrypted soul.
    void shareSoulFile(soul, soulFileName(name)).catch(() => {});
  }

  if (isFetching) {
    return (
      <ShellContent>
        <PageMessage>{tc("loading")}</PageMessage>
      </ShellContent>
    );
  }

  if (!persona) {
    return (
      <ShellContent>
        <PageMessage>{t("notFound")}</PageMessage>
      </ShellContent>
    );
  }

  const errorField = error ? (
    <StackField>
      <Text className={sectionFormError.text}>{error}</Text>
    </StackField>
  ) : null;

  if (persona.is_system_default) {
    return (
      <ShellContent>
        <PageActions>
          <Badge variant="blue">{t("default")}</Badge>
        </PageActions>

        <Section
          title={t("soulLabel")}
          action={
            <View className={soulActions.box}>
              <Button variant="outline" size="sm" onPress={handleExport}>
                {t("export")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  setCloneName(cloneNameOf(persona.name));
                  setIsCloneShown(true);
                }}
              >
                {t("clone")}
              </Button>
            </View>
          }
        >
          <StackField>
            <SoulPreview soul={persona.soul} size="tall" />
          </StackField>
          {errorField}
          <SaveRow>
            <Button variant="outline" onPress={() => router.back()}>
              {tc("cancel")}
            </Button>
          </SaveRow>
        </Section>

        {isCloneShown ? (
          <Section title={t("clone")}>
            <FieldRow label={t("cloneNameLabel")} required>
              <Input
                value={cloneName}
                onChangeText={(next) => {
                  setCloneName(next);
                  if (isCloneNameInvalid) setIsCloneNameInvalid(false);
                }}
                accessibilityLabel={t("cloneNameLabel")}
                isInvalid={isCloneNameInvalid}
                maxLength={PERSONA_NAME_MAX_LENGTH}
                returnKeyType="done"
                onSubmitEditing={() => void handleClone()}
              />
              <Button disabled={isLoading} onPress={() => void handleClone()}>
                {isLoading ? tc("loading") : t("clone")}
              </Button>
            </FieldRow>
          </Section>
        ) : null}
      </ShellContent>
    );
  }

  return (
    <ShellContent>
      <Section title={tc("details")}>
        <FieldRow label={t("nameLabel")} required>
          <Input
            value={name}
            onChangeText={(next) => {
              setName(next);
              if (isNameInvalid) setIsNameInvalid(false);
            }}
            accessibilityLabel={t("nameLabel")}
            isInvalid={isNameInvalid}
            maxLength={PERSONA_NAME_MAX_LENGTH}
          />
        </FieldRow>
      </Section>

      <Section
        title={t("soulLabel")}
        desc={t("soulHint")}
        required
        action={
          <Button variant="outline" size="sm" onPress={handleExport}>
            {t("export")}
          </Button>
        }
      >
        <StackField>
          <SoulTextarea
            value={soul}
            onChangeText={(next) => {
              setSoul(next);
              if (isSoulInvalid) setIsSoulInvalid(false);
            }}
            accessibilityLabel={t("soulLabel")}
            isInvalid={isSoulInvalid}
            autoCapitalize="none"
          />
        </StackField>
        {errorField}
        <SaveRow>
          <Button variant="outline" onPress={() => router.back()}>
            {tc("cancel")}
          </Button>
          <Button disabled={isLoading} onPress={() => void handleUpdate()}>
            {isLoading ? t("saving") : tc("save")}
          </Button>
        </SaveRow>
      </Section>

      <Section title={t("dangerZone")}>
        <Row>
          <RowMain>
            <RowTitle>{t("deletePersona")}</RowTitle>
            <RowMeta>{t("dangerZoneDescription")}</RowMeta>
          </RowMain>
          <Button variant="destructive" icon="delete" onPress={() => setIsConfirmingDelete(true)}>
            {t("deletePersona")}
          </Button>
        </Row>
      </Section>

      {/* The web's confirm() as the kit's Dialog. */}
      <Dialog
        isOpen={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        title={t("deletePersona")}
        description={t("confirmDelete")}
        footer={
          <>
            <Button variant="destructive" icon="delete" onPress={() => void handleDelete()}>
              {t("deletePersona")}
            </Button>
            <Button variant="outline" onPress={() => setIsConfirmingDelete(false)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </ShellContent>
  );
}
