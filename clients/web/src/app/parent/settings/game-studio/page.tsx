"use client";

/**
 * Game Studio settings: which screenshot service, if any, the build agent may
 * use to look at real frames of a game. This is the one place game code
 * leaves the browser, so the choice is spelled out plainly. `mode` saves
 * plaintext (the platform enforces it); a custom URL is sealed with the
 * VaultSession so the server never learns the family's endpoint. Explicit
 * Save, since a URL needs a commit point.
 */
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FieldRow } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dodi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  gameScreenshotServiceOf,
  patchGameScreenshotService,
  useAccountStore,
} from "@/stores/account-store";
import { useVaultStore } from "@/stores/vault-store";
import { isAllowedCustomServiceUrl } from "@dodi/games/screenshot-contract";
import type {
  GameScreenshotServiceMode,
  GameScreenshotServiceSettings,
} from "@dodi/types/database";

export default function GameStudioSettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const session = useVaultStore((s) => s.session);
  const account = useAccountStore((s) => s.account);
  const loaded = useAccountStore((s) => s.loaded);
  const load = useAccountStore((s) => s.load);
  const stored = gameScreenshotServiceOf(account);

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
    if (stored.customUrlEnc && !session) return; // wait for the vault
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(stored.mode);
    let url = "";
    if (stored.customUrlEnc && session) {
      try {
        url = session.decryptField(stored.customUrlEnc) ?? "";
      } catch {
        url = "";
      }
    }
    setCustomUrl(url);
    setHydrated(true);
  }, [hydrated, loaded, stored.mode, stored.customUrlEnc, session]);

  const urlInvalid =
    mode === "custom" && customUrl.trim() !== "" && !isAllowedCustomServiceUrl(customUrl);

  async function handleSave() {
    setError(null);
    if (mode === "custom" && !isAllowedCustomServiceUrl(customUrl)) {
      setError(t("screenshotServiceUrlInvalid"));
      return;
    }
    setSaving(true);
    try {
      const settings: GameScreenshotServiceSettings = { mode };
      if (mode === "custom") {
        if (!session) throw new Error(t("screenshotServiceVaultLocked"));
        settings.customUrlEnc = session.encryptField(customUrl.trim());
      }
      const res = await dodi.request("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameScreenshotService: settings }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || t("screenshotServiceSaveFailed"));
      }
      patchGameScreenshotService(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("screenshotServiceSaveFailed"));
    } finally {
      setSaving(false);
    }
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
        className="flex flex-col gap-2.5 px-5 py-4"
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
                "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary-soft"
                  : "border-border-strong bg-card hover:border-faint",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-primary bg-primary text-white" : "border-border-strong",
                )}
              >
                {selected && <Icon name="check" size={11} strokeWidth={3} />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span
                  className={cn("text-sm font-semibold", selected ? "text-primary" : "text-ink-2")}
                >
                  {option.label}
                </span>
                <span className="text-[12.5px] text-muted-foreground">{option.hint}</span>
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
