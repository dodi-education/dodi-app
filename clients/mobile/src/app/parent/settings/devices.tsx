import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { deviceStatusKey, loadDevices, pairDevice, revokeDevice } from "@dodi/client-state/devices";
import type { Device } from "@dodi/types/database";

import { api } from "@/adapters/platform";
import { Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Badge, Button, Dialog, Icon, Input, Label, Text } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { useAccountDateFormat } from "@/lib/date-format";
import { useRefreshOnPull } from "@/lib/refresh-scope";

const STATUS_BADGE: Record<string, "blue" | "success" | "gray"> = {
  active: "success",
  pending: "blue",
  revoked: "gray",
};

const devicesDeps = () => ({ api, vault: clientState.vault });

/**
 * Devices that can silently unlock the vault (web: parent/settings/devices →
 * devices-section). Pairing wraps the vault key to the new device on this
 * phone; revoking drops that wrap. The pairing code is typed in (no camera
 * scanner in this build).
 */
export default function DevicesSettingsScreen() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { formatDateTime } = useAccountDateFormat();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmDevice, setConfirmDevice] = useState<Device | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => setDevices(await loadDevices(api)), []);
  // Pull to refresh (the settings page): the paired devices and their last-seen times.
  useRefreshOnPull("devices", reload);

  useEffect(() => {
    let isCurrent = true;
    void loadDevices(api).then((loaded) => {
      if (isCurrent) setDevices(loaded);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  async function pair(): Promise<void> {
    setError(null);
    setNotice(null);
    const pairingCode = code.trim();
    if (!pairingCode) return;
    setIsPairing(true);
    // Wraps the vault to the new device and persists that before activating it.
    if (await pairDevice(devicesDeps(), pairingCode)) {
      setCode("");
      setNotice(t("devicePaired"));
      await reload();
    } else {
      setError(t("pairFailed"));
    }
    setIsPairing(false);
  }

  async function revoke(device: Device): Promise<void> {
    setConfirmDevice(null);
    setError(null);
    setNotice(null);
    setRevokingId(device.id);
    // Drops the vault wrap first, so the device loses access even if the
    // status update fails.
    if (await revokeDevice(devicesDeps(), device)) {
      setNotice(t("deviceRevoked"));
      await reload();
    } else {
      setError(t("revokeFailed"));
    }
    setRevokingId(null);
  }

  return (
    <>
      <Section title={t("devicesTitle")} desc={t("devicesDescription")}>
        <View className="flex-col gap-3 px-5 py-4">
          <Label>{t("pairingCode")}</Label>
          <View className="flex-col gap-2">
            <Input
              accessibilityLabel={t("pairingCode")}
              value={code}
              onChangeText={(text) => {
                setError(null);
                setNotice(null);
                setCode(text);
              }}
              placeholder={t("pairingCodePlaceholder")}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              onSubmitEditing={() => void pair()}
            />
            <Button disabled={isPairing || !code.trim()} onPress={() => void pair()}>
              {isPairing ? t("pairing") : t("pairDevice")}
            </Button>
          </View>
          {error ? (
            <Text className="text-sm text-destructive" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {notice ? <Text className="text-sm text-success">{notice}</Text> : null}
        </View>

        {devices === null ? (
          <View className="px-5 py-6">
            <Text className="text-center text-sm text-muted-foreground">{t("loadingDevices")}</Text>
          </View>
        ) : devices.length === 0 ? (
          <View className="px-5 py-6">
            <Text className="text-center text-sm text-muted-foreground">{t("noDevices")}</Text>
          </View>
        ) : (
          devices.map((device) => (
            <Row key={device.id}>
              <View className="size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft">
                <Icon name="lock" size={16} color="primary" />
              </View>
              <RowMain>
                <RowTitle>
                  <RowTitleText>{device.name || t("unnamedDevice")}</RowTitleText>
                  <Badge variant={STATUS_BADGE[device.status] ?? "gray"}>{t(deviceStatusKey(device.status))}</Badge>
                </RowTitle>
                <RowMeta>
                  {device.last_seen_at
                    ? t("lastSeen", { date: formatDateTime(device.last_seen_at) })
                    : t("neverSeen")}
                </RowMeta>
              </RowMain>
              {device.status !== "revoked" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revokingId === device.id}
                  onPress={() => setConfirmDevice(device)}
                >
                  {revokingId === device.id ? t("revoking") : t("revokeDevice")}
                </Button>
              ) : null}
            </Row>
          ))
        )}
      </Section>

      {/* web: window.confirm(confirmRevokeDevice) */}
      <Dialog
        isOpen={confirmDevice !== null}
        onClose={() => setConfirmDevice(null)}
        title={t("revokeDevice")}
        description={t("confirmRevokeDevice")}
        footer={
          <>
            <Button variant="destructive" onPress={() => confirmDevice && void revoke(confirmDevice)}>
              {t("revokeDevice")}
            </Button>
            <Button variant="outline" onPress={() => setConfirmDevice(null)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </>
  );
}
