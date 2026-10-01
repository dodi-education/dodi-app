/**
 * Set / change / remove the parent PIN (web: parent/parent-pin-settings). The
 * PIN is sealed with the vault on this device; the server stays blind.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  PARENT_PIN_LENGTH,
  type ParentPinOutcome,
  removeParentPin,
  sanitizePinInput,
  saveParentPin,
} from "@dodi/client-state/parent-pin";

import { api, mobilePlatform } from "@/adapters/platform";
import { Button, Card, Notice, Text, TextField } from "@/components/ui";
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

  function show(outcome: ParentPinOutcome): void {
    if (outcome.kind === "done") {
      setPin("");
      setDone(t(outcome.key));
    } else {
      setError(t(outcome.key));
    }
  }

  async function save(): Promise<void> {
    setError(null);
    setDone(null);
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
    setError(null);
    setDone(null);
    setBusy("remove");
    show(await removeParentPin({ api, account: clientState.account }));
    setBusy(null);
  }

  return (
    <Card title={t("settingsTitle")} description={t("settingsDescription")}>
      <TextField
        label={t("newLabel")}
        value={pin}
        onChangeText={(text) => {
          setError(null);
          setDone(null);
          setPin(sanitizePinInput(text));
        }}
        keyboardType="number-pad"
        maxLength={PARENT_PIN_LENGTH}
        placeholder="••••"
        autoComplete="off"
        className="tracking-[0.4em]"
        secureTextEntry
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
      <Button
        label={busy === "save" ? t("saving") : hasPin ? t("change") : t("set")}
        isLoading={busy === "save"}
        disabled={busy !== null || pin.length !== PARENT_PIN_LENGTH}
        onPress={() => void save()}
      />
      {hasPin ? (
        <Button
          variant="ghost"
          label={busy === "remove" ? t("removing") : t("remove")}
          isLoading={busy === "remove"}
          disabled={busy !== null}
          onPress={() => void remove()}
          className="self-start"
        />
      ) : (
        <View className="min-h-11 justify-center">
          <Text variant="muted">{isLoaded ? t("statusOff") : "…"}</Text>
        </View>
      )}
    </Card>
  );
}
