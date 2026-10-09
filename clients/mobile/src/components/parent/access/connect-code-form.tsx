import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { access } from "@dodi/ui-recipes";

import { Button, Input, Label, Text } from "@/components/ui";

interface ConnectCodeFormProps {
  /** The field label, e.g. "Connect a robot". */
  label: string;
  /** Shown under the field (an error from a previous lookup). */
  error?: string | null;
}

/**
 * The code a robot or agent shows (web: access/connect-code-form): opens
 * "Allow access" (/parent/authorize?code=…) for it.
 */
export function ConnectCodeForm({ label, error }: ConnectCodeFormProps) {
  const t = useTranslations("access");
  const router = useRouter();
  const [code, setCode] = useState("");

  function submit(): void {
    const trimmed = code.trim();
    if (trimmed) router.push(`/parent/authorize?code=${encodeURIComponent(trimmed)}` as Href);
  }

  return (
    <View className={access.block}>
      <Label>{label}</Label>
      <View className="flex-col gap-2">
        <Input
          accessibilityLabel={label}
          value={code}
          onChangeText={setCode}
          placeholder={t("pairingCodePlaceholder")}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          onSubmitEditing={submit}
        />
        <Button disabled={!code.trim()} onPress={submit}>
          {t("lookUp")}
        </Button>
      </View>
      {error ? (
        <Text className={access.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
