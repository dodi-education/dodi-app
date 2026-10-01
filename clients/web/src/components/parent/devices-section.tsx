"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import {
  deviceStatusKey,
  loadDevices,
  pairDevice,
  revokeDevice,
} from "@dodi/client-state/devices";
import type { Device } from "@dodi/types/database";

const STATUS_BADGE: Record<string, "blue" | "success" | "gray"> = {
  active: "success",
  pending: "blue",
  revoked: "gray",
};

const devicesDeps = () => ({ api: dodi, vault: clientState.vault });

/**
 * Pair and revoke devices that can silently unlock the E2EE vault. Pairing wraps
 * the in-memory VMK to the new device's KEM key (client-side) and persists it via
 * `PUT /api/vault/keys` before activating; revoking drops that wrap. The server
 * never sees the VMK.
 */
export function DevicesSection() {
  const t = useTranslations("settings");
  const { formatDateTime } = useDateFormat();

  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setDevices(await loadDevices(dodi));
  }

  useEffect(() => {
    // Deferred a microtask so the fetch's setState doesn't run synchronously on
    // the effect tick (cascading-render lint).
    void Promise.resolve().then(load);
  }, []);

  async function handlePair(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const pairingCode = code.trim();
    if (!pairingCode) return;

    setPairing(true);
    // Wraps the vault to the new device and persists that BEFORE activating it.
    if (await pairDevice(devicesDeps(), pairingCode)) {
      setCode("");
      setNotice(t("devicePaired"));
      await load();
    } else {
      setError(t("pairFailed"));
    }
    setPairing(false);
  }

  async function handleRevoke(device: Device) {
    if (!window.confirm(t("confirmRevokeDevice"))) return;
    setError(null);
    setNotice(null);
    setRevokingId(device.id);
    // Drops the vault wrap first, so the device loses access even if the
    // status update fails.
    if (await revokeDevice(devicesDeps(), device)) {
      setNotice(t("deviceRevoked"));
      await load();
    } else {
      setError(t("revokeFailed"));
    }
    setRevokingId(null);
  }

  return (
    <Section title={t("devicesTitle")} desc={t("devicesDescription")}>
      <form onSubmit={handlePair} className="flex flex-col gap-3 px-5 py-4">
        <Label htmlFor="pairing-code">{t("pairingCode")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="pairing-code"
            value={code}
            onChange={(e) => {
              setError(null);
              setNotice(null);
              setCode(e.target.value);
            }}
            placeholder={t("pairingCodePlaceholder")}
            autoComplete="off"
          />
          <Button
            type="submit"
            disabled={pairing || !code.trim()}
            className="sm:shrink-0"
          >
            {pairing ? t("pairing") : t("pairDevice")}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-success">{notice}</p>}
      </form>

      {devices === null ? (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          {t("loadingDevices")}
        </div>
      ) : devices.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          {t("noDevices")}
        </div>
      ) : (
        devices.map((device) => (
          <Row key={device.id}>
            <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon name="lock" size={16} />
            </div>
            <RowMain>
              <RowTitle>
                {device.name || t("unnamedDevice")}
                <Badge variant={STATUS_BADGE[device.status] ?? "gray"}>
                  {t(deviceStatusKey(device.status))}
                </Badge>
              </RowTitle>
              <RowMeta>
                {device.last_seen_at
                  ? t("lastSeen", {
                      date: formatDateTime(device.last_seen_at),
                    })
                  : t("neverSeen")}
              </RowMeta>
            </RowMain>
            {device.status !== "revoked" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={revokingId === device.id}
                onClick={() => handleRevoke(device)}
              >
                {revokingId === device.id ? t("revoking") : t("revokeDevice")}
              </Button>
            ) : null}
          </Row>
        ))
      )}
    </Section>
  );
}
