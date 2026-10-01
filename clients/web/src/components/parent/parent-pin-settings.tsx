"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { markParentUnlocked } from "@/lib/parent-lock";
import { useAccountStore } from "@/stores/account-store";
import {
  PARENT_PIN_LENGTH as PIN_LENGTH,
  removeParentPin,
  sanitizePinInput,
  saveParentPin,
} from "@dodi/client-state/parent-pin";

const pinDeps = () => ({
  api: dodi,
  account: clientState.account,
  vault: clientState.vault,
  parentLock: { markUnlocked: markParentUnlocked },
});

/**
 * Set / change / remove the 4-digit parent PIN. The vault is already unlocked
 * here (the parent layout's VaultGate guarantees it), so we seal the PIN with
 * `session.encryptField` and PATCH the sealed blob — the server stays blind.
 * Changing/removing needs no current PIN, mirroring change-password (which
 * needs no old password) since the caller is already inside the parent area.
 */
export function ParentPinSettings() {
  const t = useTranslations("parentPin");
  const pinEnc = useAccountStore((s) => s.account?.parent_pin_enc ?? null);
  const loaded = useAccountStore((s) => s.loaded);
  const load = useAccountStore((s) => s.load);
  const hasPin = pinEnc !== null;

  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  function clearFeedback() {
    setError(null);
    setDone(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    clearFeedback();

    if (pin.length !== PIN_LENGTH) return setError(t("invalid"));

    setBusy("save");
    // Seals the PIN, keeps this area unlocked, then caches the sealed blob.
    const outcome = await saveParentPin(pinDeps(), pin);
    if (outcome.kind === "done") {
      setPin("");
      setDone(t(outcome.key));
    } else {
      setError(t(outcome.key));
    }
    setBusy(null);
  }

  async function handleRemove() {
    clearFeedback();
    setBusy("remove");
    const outcome = await removeParentPin(pinDeps());
    if (outcome.kind === "done") {
      setPin("");
      setDone(t(outcome.key));
    } else {
      setError(t(outcome.key));
    }
    setBusy(null);
  }

  return (
    <Section title={t("settingsTitle")} desc={t("settingsDescription")}>
      <form onSubmit={handleSave} className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="parent-pin">{t("newLabel")}</Label>
          <Input
            id="parent-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_LENGTH}
            placeholder="••••"
            value={pin}
            onChange={(e) => {
              clearFeedback();
              setPin(sanitizePinInput(e.target.value));
            }}
            className="max-w-[12rem] tracking-[0.4em]"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {done && <p className="text-sm text-success">{done}</p>}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="submit"
            disabled={busy !== null || pin.length !== PIN_LENGTH}
          >
            {busy === "save" ? t("saving") : hasPin ? t("change") : t("set")}
          </Button>
          {hasPin ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy !== null}
              className="text-[13px] font-semibold text-destructive transition-colors hover:text-destructive/80 disabled:opacity-50"
            >
              {busy === "remove" ? t("removing") : t("remove")}
            </button>
          ) : (
            <span className="text-[13px] text-muted-foreground">
              {loaded ? t("statusOff") : "…"}
            </span>
          )}
        </div>
      </form>
    </Section>
  );
}
