"use client";

/**
 * Game Studio settings: which screenshot service, if any, the build agent may
 * use to look at real frames of a game. This is the one place game code
 * leaves the browser, so the choice is spelled out plainly. Loading and saving
 * (a custom URL is sealed with the VaultSession) live in
 * `@dodi/client-state/game-studio-settings`. Explicit Save, since a URL needs
 * a commit point.
 */
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  initialScreenshotService,
  isScreenshotUrlInvalid,
  saveScreenshotService,
} from "@dodi/client-state/game-studio-settings";
import { radioCard } from "@dodi/ui-recipes";
import type { GameScreenshotServiceMode } from "@dodi/types/database";

import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/utils";
import { useAccountStore } from "@/stores/account-store";
import { useVaultStore } from "@/stores/vault-store";

export default function GameStudioSettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const session = useVaultStore((s) => s.session);
  const account = useAccountStore((s) => s.account);
  const loaded = useAccountStore((s) => s.loaded);
  const load = useAccountStore((s) => s.load);

  const [mode, setMode] = useState<GameScreenshotServiceMode>("dodi");
  const [customUrl, setCustomUrl] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Populate the controls once the account is loaded (and the vault is ready,
  // if a sealed custom URL needs decrypting). Runs once.
  useEffect(() => {
    if (hydrated || !loaded) return;
    const initial = initialScreenshotService(account, session);
    if (!initial) return; // wait for the vault
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(initial.mode);
    setCustomUrl(initial.customUrl);
    setHydrated(true);
  }, [hydrated, loaded, account, session]);

  const urlInvalid = isScreenshotUrlInvalid({ mode, customUrl });

  async function handleSave() {
    setError(null);
    setSaving(true);
    const failure = await saveScreenshotService(
      { api: dodi, account: clientState.account, vault: clientState.vault },
      { mode, customUrl },
    );
    if (failure) {
      setError("key" in failure ? t(failure.key) : failure.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  const options: Array<{ value: GameScreenshotServiceMode; label: string; hint: string }> = [
    { value: "off", label: t("screenshotServiceOff"), hint: t("screenshotServiceOffHint") },
    { value: "dodi", label: t("screenshotServiceDodi"), hint: t("screenshotServiceDodiHint") },
    {
      value: "custom",
      label: t("screenshotServiceCustom"),
      hint: t("screenshotServiceCustomHint"),
    },
  ];

  return (
    <Section title={t("gameStudioVisualTitle")} desc={t("gameStudioVisualDescription")}>
      <div
        className={cn(radioCard.webGroup, radioCard.group)}
        role="radiogroup"
        aria-label={t("screenshotServiceLabel")}
      >
        {options.map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!hydrated}
              onClick={() => setMode(option.value)}
              className={cn(
                radioCard.web,
                radioCard.box,
                selected ? radioCard.boxSelected : cn(radioCard.boxIdle, radioCard.webIdle),
              )}
            >
              <span
                className={cn(
                  radioCard.webDot,
                  radioCard.dot,
                  selected ? radioCard.dotSelected : radioCard.dotIdle,
                )}
              >
                {selected && <Icon name="check" size={radioCard.dotIconSize} strokeWidth={3} />}
              </span>
              <span className={cn(radioCard.webBody, radioCard.body)}>
                <span
                  className={cn(
                    radioCard.label,
                    selected ? radioCard.labelSelected : radioCard.labelIdle,
                  )}
                >
                  {option.label}
                </span>
                <span className={radioCard.hint}>{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      {mode === "custom" && (
        <FieldRow
          label={t("screenshotServiceUrlLabel")}
          hint={t("screenshotServiceUrlHint")}
          htmlFor="screenshot-service-url"
          required
        >
          <Input
            id="screenshot-service-url"
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder={t("screenshotServiceUrlPlaceholder")}
            aria-invalid={urlInvalid || undefined}
            aria-required
            className="sm:w-[320px]"
          />
        </FieldRow>
      )}
      {(error || urlInvalid) && (
        <div className="px-5 py-3 text-sm text-danger" role="alert">
          {error ?? t("screenshotServiceUrlInvalid")}
        </div>
      )}
      <SaveRow note={saved ? tc("saved") : undefined}>
        <Button onClick={handleSave} disabled={saving || !hydrated}>
          {saving ? tc("loading") : tc("save")}
        </Button>
      </SaveRow>
    </Section>
  );
}
