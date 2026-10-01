import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useTranslations } from "use-intl";
import { deviceStatusKey, loadDevices, pairDevice, revokeDevice } from "@dodi/client-state/devices";
import type { Device } from "@dodi/types/database";

import { api } from "@/adapters/platform";
import { Button, Card, Notice, Screen, Text, TextField } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { IconLock } from "@/components/ui/icons";
import { clientState } from "@/lib/client-state";
import { useAccountDateFormat } from "@/lib/date-format";

const STATUS_TONE: Record<string, "blue" | "success" | "gray"> = {
  active: "success",
  pending: "blue",
  revoked: "gray",
};

const devicesDeps = () => ({ api, vault: clientState.vault });

/**
 * Devices that can silently unlock the vault (web: parent/settings/devices).
 * Pairing wraps the vault key to the new device on this phone; revoking drops
 * that wrap. The pairing code is typed in (no camera scanner in this build).
 */
export default function DevicesSettingsScreen() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { formatDateTime } = useAccountDateFormat();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => setDevices(await loadDevices(api)), []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function pair(): Promise<void> {
    setError(null);
    setNotice(null);
    if (!code.trim()) return;
    setIsPairing(true);
    if (await pairDevice(devicesDeps(), code)) {
      setCode("");
      setNotice(t("devicePaired"));
      await reload();
    } else {
      setError(t("pairFailed"));
    }
    setIsPairing(false);
  }

  async function revoke(device: Device): Promise<void> {
    setError(null);
    setNotice(null);
    setRevokingId(device.id);
    if (await revokeDevice(devicesDeps(), device)) {
      setNotice(t("deviceRevoked"));
      await reload();
    } else {
      setError(t("revokeFailed"));
    }
    setRevokingId(null);
  }

  function confirmRevoke(device: Device): void {
    Alert.alert(t("revokeDevice"), t("confirmRevokeDevice"), [
      { text: tc("cancel"), style: "cancel" },
      { text: t("revokeDevice"), style: "destructive", onPress: () => void revoke(device) },
    ]);
  }

  return (
    <Screen>
      <Card title={t("devicesTitle")} description={t("devicesDescription")}>
        <TextField
          label={t("pairingCode")}
          placeholder={t("pairingCodePlaceholder")}
          value={code}
          onChangeText={(text) => {
            setError(null);
            setNotice(null);
            setCode(text);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          onSubmitEditing={() => void pair()}
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        <Button
          label={isPairing ? t("pairing") : t("pairDevice")}
          isLoading={isPairing}
          disabled={!code.trim()}
          onPress={() => void pair()}
        />
      </Card>

      <Card>
        {devices === null ? (
          <Text variant="muted" className="text-center">{t("loadingDevices")}</Text>
        ) : devices.length === 0 ? (
          <Text variant="muted" className="text-center">{t("noDevices")}</Text>
        ) : (
          devices.map((device, index) => (
            <View
              key={device.id}
              className={index > 0 ? "flex-row items-center gap-3 border-t border-border pt-3" : "flex-row items-center gap-3"}
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-soft">
                <IconLock size={16} color="#2F6BD8" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="font-semibold">{device.name || t("unnamedDevice")}</Text>
                <Badge label={t(deviceStatusKey(device.status))} tone={STATUS_TONE[device.status] ?? "gray"} />
                <Text variant="muted">
                  {device.last_seen_at
                    ? t("lastSeen", { date: formatDateTime(device.last_seen_at) })
                    : t("neverSeen")}
                </Text>
              </View>
              {device.status !== "revoked" ? (
                <Button
                  variant="ghost"
                  label={revokingId === device.id ? t("revoking") : t("revokeDevice")}
                  disabled={revokingId === device.id}
                  onPress={() => confirmRevoke(device)}
                />
              ) : null}
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
