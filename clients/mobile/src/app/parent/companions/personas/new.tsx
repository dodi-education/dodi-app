import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { flowErrorText } from "@dodi/client-state/flow-error";
import {
  PERSONA_NAME_MAX_LENGTH,
  createPersona,
  invalidPersonaFields,
  personaNameFromFileName,
} from "@dodi/client-state/personas";
import { input, sectionFormError, soulFile } from "@dodi/ui-recipes";

import { pickSoulFile } from "@/adapters/soul-files";
import { SoulPreview } from "@/components/personas/soul-preview";
import { SoulTextarea } from "@/components/personas/soul-textarea";
import { FieldRow, StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Button, Input, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { parentFlowDeps } from "@/lib/parent-flow-deps";

/**
 * Create a persona, or import one from a `.soul.md` file with `?import=true`
 * (web: parent/companions/personas/new/page). The OS document picker stands in for the
 * web's file input; either way the soul is sealed on the device.
 */
export default function NewPersonaScreen() {
  const t = useTranslations("personas");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useLocalSearchParams<{ import?: string }>();
  const isImport = params.import === "true";

  const [name, setName] = useState("");
  const [soul, setSoul] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isNameInvalid, setIsNameInvalid] = useState(false);
  const [isSoulInvalid, setIsSoulInvalid] = useState(false);
  const [isFileInvalid, setIsFileInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handlePickFile(): Promise<void> {
    try {
      const file = await pickSoulFile();
      if (!file) return;
      setSoul(file.text);
      setFileName(file.name);
      setIsFileInvalid(false);
      if (!name) setName(personaNameFromFileName(file.name));
    } catch {
      setIsFileInvalid(true);
    }
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    const nextInvalid = {
      ...invalidPersonaFields({ name, soul }),
      file: isImport && !fileName,
    };
    if (nextInvalid.name || nextInvalid.file || nextInvalid.soul) {
      setIsNameInvalid(nextInvalid.name);
      setIsFileInvalid(nextInvalid.file);
      setIsSoulInvalid(nextInvalid.soul);
      return;
    }
    setIsLoading(true);
    try {
      await createPersona(parentFlowDeps(), { name, soul });
    } catch (err) {
      setError(flowErrorText(err, t("failedToCreate"), { tooLong: t("soulTooLong"), vaultLocked: t("failedToCreate") }));
      setIsLoading(false);
      return;
    }
    router.replace("/parent/companions?tab=personas" as Href);
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
            placeholder={t("namePlaceholder")}
            accessibilityLabel={t("nameLabel")}
            isInvalid={isNameInvalid}
            maxLength={PERSONA_NAME_MAX_LENGTH}
          />
        </FieldRow>
        {isImport ? (
          <FieldRow label={t("fileLabel")} required>
            <View className={soulFile.row}>
              <Button
                variant="outline"
                icon="upload"
                className={cn(isFileInvalid && input.invalid)}
                accessibilityLabel={`${t("fileLabel")}: ${tc("chooseFile")}`}
                onPress={() => void handlePickFile()}
              >
                {tc("chooseFile")}
              </Button>
              {fileName ? (
                <Text className={soulFile.name} numberOfLines={1}>
                  {fileName}
                </Text>
              ) : null}
            </View>
          </FieldRow>
        ) : null}
      </Section>

      <Section title={t("soulLabel")} desc={t("soulHint")} required={!isImport}>
        {isImport ? (
          soul ? (
            <StackField>
              <SoulPreview soul={soul} size="short" />
            </StackField>
          ) : null
        ) : (
          <StackField>
            <SoulTextarea
              value={soul}
              onChangeText={(next) => {
                setSoul(next);
                if (isSoulInvalid) setIsSoulInvalid(false);
              }}
              placeholder={t("soulPlaceholder")}
              accessibilityLabel={t("soulLabel")}
              isInvalid={isSoulInvalid}
              autoCapitalize="none"
            />
          </StackField>
        )}

        {error ? (
          <StackField>
            <Text className={sectionFormError.text}>{error}</Text>
          </StackField>
        ) : null}

        <SaveRow>
          <Button variant="outline" onPress={() => router.back()}>
            {tc("cancel")}
          </Button>
          <Button disabled={isLoading} onPress={() => void handleSubmit()}>
            {isLoading ? tc("loading") : isImport ? t("import") : t("createPersona")}
          </Button>
        </SaveRow>
      </Section>
    </ShellContent>
  );
}
