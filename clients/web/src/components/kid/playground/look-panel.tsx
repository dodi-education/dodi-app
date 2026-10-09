"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  ACCESSORIES,
  ACCESSORY_LIST,
  CHARACTER_MODELS,
  COLOR_SWATCHES,
  accessorySocketOf,
  characterModelFor,
  customAssetRef,
  type AccessoryRef,
  type CharacterModelRef,
} from "@dodi/character/character-catalog";
import { defaultLook } from "@dodi/character/character-look";
import { customSocketsOf } from "@dodi/client-state/character-asset-store";
import { COMPANION_NAME_MAX_LENGTH, renameCompanion } from "@dodi/client-state/companions";
import { playground as p } from "@dodi/ui-recipes";

import { useActiveCompanion } from "@/hooks/use-active-companion";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { cn } from "@/lib/utils";
import { useCharacterAssetStore } from "@/stores/character-asset-store";

import { useLookEditor } from "./use-look-editor";

const KID_ACCESSORIES = ACCESSORY_LIST.filter((name) => ACCESSORIES[name].isKidSelectable);
const MODELS = Object.values(CHARACTER_MODELS);

/** The companion's name, saved when the field is left. Remounts per companion. */
function NameField({ kidId, companionId, saved, placeholder }: { kidId: string; companionId: string; saved: string; placeholder: string }) {
  const t = useTranslations("playground");
  const [draft, setDraft] = useState(saved);
  function save() {
    if (draft.trim() === saved) return;
    void renameCompanion(companionFlowDeps(), kidId, companionId, draft).catch(() => setDraft(saved));
  }
  return (
    <div className={cn(p.section, p.webSection)}>
      <label htmlFor="companion-name" className={p.label}>
        {t("name")}
      </label>
      <input
        id="companion-name"
        className={cn(p.input, p.webInput)}
        value={draft}
        placeholder={placeholder}
        maxLength={COMPANION_NAME_MAX_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );
}

/** Colors per part, accessories, the avatar (when allowed) and the name. */
export function LookPanel() {
  const t = useTranslations("playground");
  const { kid, companion, name } = useActiveCompanion();
  const { look, change, status } = useLookEditor();
  const model = characterModelFor(look.model);
  // The family's own avatars and accessories (from the dodi CLI), after the catalog's.
  const assets = useCharacterAssetStore((s) => s.assets);
  const loadAssets = useCharacterAssetStore((s) => s.load);
  useEffect(() => {
    void loadAssets().catch(() => {});
  }, [loadAssets]);
  const customAvatars = (assets ?? []).filter((a) => a.kind === "avatar");
  const customAccessories = (assets ?? []).filter((a) => a.kind === "accessory");

  function setColor(material: string, base: string) {
    change({ ...look, colors: { ...look.colors, [material]: base } });
  }

  function toggleAccessory(accessory: AccessoryRef) {
    const isWorn = look.accessories.includes(accessory);
    // One accessory per socket: a new hat replaces the old one.
    const sockets = customSocketsOf(assets);
    const socket = accessorySocketOf(accessory, sockets);
    const others = look.accessories.filter(
      (a) => a !== accessory && (socket === null || accessorySocketOf(a, sockets) !== socket),
    );
    change({ ...look, accessories: isWorn ? others : [...others, accessory] });
  }

  function setModel(id: CharacterModelRef) {
    if (id !== look.model) change({ ...defaultLook(id), accessories: look.accessories });
  }

  return (
    <>
      {kid && companion ? (
        <NameField key={`${companion.id}:${companion.name ?? ""}`} kidId={kid.id} companionId={companion.id} saved={companion.name ?? ""} placeholder={name} />
      ) : null}

      {model.customizable.map((part) => {
        const partLabel = t(`parts.${part.labelKey}`);
        return (
          <div key={part.material} className={cn(p.section, p.webSection)} role="radiogroup" aria-label={t("colorFor", { part: partLabel })}>
            <span className={p.label}>{partLabel}</span>
            <div className={cn(p.row, p.webRow)}>
              {COLOR_SWATCHES.map((swatch) => {
                const isSelected = look.colors[part.material] === swatch.base;
                return (
                  <button
                    key={swatch.base}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={swatch.base}
                    className={cn(p.swatch, p.webSwatch, isSelected && p.swatchSelected)}
                    style={{ backgroundColor: swatch.base }}
                    onClick={() => setColor(part.material, swatch.base)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <div className={cn(p.section, p.webSection)}>
        <span className={p.label}>{t("accessories")}</span>
        <div className={cn(p.row, p.webRow)}>
          {KID_ACCESSORIES.map((accessory) => {
            const isWorn = look.accessories.includes(accessory);
            return (
              <button
                key={accessory}
                type="button"
                aria-pressed={isWorn}
                className={cn(p.chip, p.webChip, isWorn && p.chipSelected)}
                onClick={() => toggleAccessory(accessory)}
              >
                <span className={p.chipText}>{t(`accessoryNames.${ACCESSORIES[accessory].labelKey}`)}</span>
              </button>
            );
          })}
          {customAccessories.map((asset) => {
            const ref = customAssetRef(asset.id);
            const isWorn = look.accessories.includes(ref);
            return (
              <button
                key={asset.id}
                type="button"
                aria-pressed={isWorn}
                className={cn(p.chip, p.webChip, isWorn && p.chipSelected)}
                onClick={() => toggleAccessory(ref)}
              >
                <span className={p.chipText}>{asset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {kid?.can_change_companion_avatar && MODELS.length + customAvatars.length > 1 ? (
        <div className={cn(p.section, p.webSection)}>
          <span className={p.label}>{t("avatar")}</span>
          <div className={cn(p.row, p.webRow)}>
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={look.model === m.id}
                className={cn(p.chip, p.webChip, look.model === m.id && p.chipSelected)}
                onClick={() => setModel(m.id)}
              >
                <span className={p.chipText}>{t(`avatars.${m.labelKey}`)}</span>
              </button>
            ))}
            {customAvatars.map((asset) => {
              const ref = customAssetRef(asset.id);
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={look.model === ref}
                  className={cn(p.chip, p.webChip, look.model === ref && p.chipSelected)}
                  onClick={() => setModel(ref)}
                >
                  <span className={p.chipText}>{asset.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={cn(p.row, p.webRow, "justify-between")}>
        <button type="button" className={cn(p.chip, p.webChip)} onClick={() => change(defaultLook(look.model))}>
          <span className={p.chipText}>{t("reset")}</span>
        </button>
        <span className={p.status} role="status">
          {status === "saved" ? t("saved") : status === "failed" ? t("saveFailed") : ""}
        </span>
      </div>
    </>
  );
}
