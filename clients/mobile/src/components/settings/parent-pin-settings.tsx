/**
 * Set / change / remove the parent PIN (web: parent/parent-pin-settings). The
 * PIN is sealed with the vault on this device; the server stays blind.
 */
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  PARENT_PIN_LENGTH,
  type ParentPinOutcome,
  removeParentPin,
  sanitizePinInput,
  saveParentPin,
} from "@dodi/client-state/parent-pin";

import { api, mobilePlatform } from "@/adapters/platform";
import { Section } from "@/components/parent/section";
import { Button, Input, Label, Text } from "@/components/ui";
import { clientState, useAccountStore } from "@/lib/client-state";

export function ParentPinSettings() {
  const t = useTranslations("parentPin");
  const hasPin = useAccountStore((s) => (s.account?.parent_pin_enc ?? null) !== null);
  const isLoaded = useAccountStore((s) => s.loaded);
  const load = useAccountStore((s) => s.load);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  function clearFeedback(): void {
    setError(null);
    setDone(null);
  }

  function show(outcome: ParentPinOutcome): void {
    if (outcome.kind === "done") {
      setPin("");
      setDone(t(outcome.key));
    } else {
      setError(t(outcome.key));
    }
  }

  async function save(): Promise<void> {
    clearFeedback();
    if (pin.length !== PARENT_PIN_LENGTH) return setError(t("invalid"));
    setBusy("save");
    show(
      await saveParentPin(
        {
          api,
          account: clientState.account,
          vault: clientState.vault,
          parentLock: mobilePlatform.parentLock,
        },
        pin,
      ),
    );
    setBusy(null);
  }

  async function remove(): Promise<void> {
    clearFeedback();
    setBusy("remove");
    show(await removeParentPin({ api, account: clientState.account }));
    setBusy(null);
  }

  return (
    <Section title={t("settingsTitle")} desc={t("settingsDescription")}>
      <View className="flex-col gap-4 px-5 py-4">
        <View className="flex-col gap-2">
          <Label>{t("newLabel")}</Label>
          <Input
            accessibilityLabel={t("newLabel")}
            value={pin}
            onChangeText={(text) => {
              clearFeedback();
              setPin(sanitizePinInput(text));
            }}
            secureTextEntry
            keyboardType="number-pad"
            autoComplete="off"
            maxLength={PARENT_PIN_LENGTH}
            placeholder="••••"
            onSubmitEditing={() => void save()}
            className="max-w-[12rem] tracking-[0.4em]"
          />
        </View>

        {error ? (
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {done ? <Text className="text-sm text-success">{done}</Text> : null}

        <View className="flex-row items-center justify-between gap-3">
          <Button disabled={busy !== null || pin.length !== PARENT_PIN_LENGTH} onPress={() => void save()}>
            {busy === "save" ? t("saving") : hasPin ? t("change") : t("set")}
          </Button>
          {hasPin ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              hitSlop={14}
              onPress={() => void remove()}
              className={busy !== null ? "opacity-50" : "active:opacity-80"}
            >
              <Text className="text-[13px] font-semibold text-destructive">
                {busy === "remove" ? t("removing") : t("remove")}
              </Text>
            </Pressable>
          ) : (
            <Text className="text-[13px] text-muted-foreground">{isLoaded ? t("statusOff") : "…"}</Text>
          )}
        </View>
      </View>
    </Section>
  );
}
