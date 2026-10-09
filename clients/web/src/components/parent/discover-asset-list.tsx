"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { DiscoverAssetCard } from "@dodi/client-state/discover-character-assets";
import { formAlert, libraryPill, libraryRow } from "@dodi/ui-recipes";

import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDiscoverAssetStore } from "@/stores/discover-asset-store";

/**
 * "Discover avatars and accessories" on the parent Discover page: live
 * assets other families published, plaintext by design. Add writes this
 * family's sharing row (play-in-place, nothing is copied) so kids can wear it
 * in the Playground; once added, the red trash removes it again. Hidden while
 * there are none. Mobile: components/parent/discover-asset-list.
 */
export function DiscoverAssetList() {
  const t = useTranslations("characterAssets");
  const cards = useDiscoverAssetStore((s) => s.cards);
  const load = useDiscoverAssetStore((s) => s.load);
  const add = useDiscoverAssetStore((s) => s.add);
  const remove = useDiscoverAssetStore((s) => s.remove);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load().catch(() => setError(t("discoverFailed")));
  }, [load, t]);

  async function toggle(card: DiscoverAssetCard): Promise<void> {
    if (busyId) return;
    setBusyId(card.id);
    setError(null);
    try {
      await (card.is_added ? remove(card.id) : add(card.id));
    } catch {
      setError(t("discoverActionFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (!cards || cards.length === 0) {
    return error ? (
      <Section title={t("discoverTitle")}>
        <div className={cn(formAlert.box, formAlert.text)}>{error}</div>
      </Section>
    ) : null;
  }

  return (
    <Section title={t("discoverTitle")} desc={t("discoverDescription")}>
      {cards.map((card) => (
        <div key={card.id} className={cn(libraryRow.web, libraryRow.box)}>
          <div className={cn(libraryRow.webBody, libraryRow.body)}>
            {card.preview_image ? (
              <Image
                src={card.preview_image}
                alt=""
                width={60}
                height={60}
                unoptimized
                className={cn(libraryRow.thumb, libraryRow.webThumb)}
              />
            ) : (
              <div
                className={cn(
                  libraryRow.webThumbFallback,
                  libraryRow.thumbFallback,
                  libraryRow.thumbKind,
                  libraryRow.webThumbKind,
                )}
              >
                <Icon name={card.kind === "avatar" ? "personas" : "sparkles"} size={28} />
              </div>
            )}
            <div className={libraryRow.main}>
              <div className={cn(libraryRow.webTitleRow, libraryRow.titleRow)}>
                <span className={cn(libraryRow.webTitle, libraryRow.title)}>{card.name}</span>
                {card.is_added ? (
                  <span
                    className={cn(
                      libraryPill.webWithIcon,
                      libraryPill.withIcon,
                      libraryPill.box,
                      libraryPill.text,
                      libraryPill.primary,
                      libraryPill.primaryText,
                    )}
                  >
                    <Icon name="check" size={11} strokeWidth={3} />
                    {t("discoverAdded")}
                  </span>
                ) : null}
              </div>
              <div className={cn(libraryRow.meta, libraryRow.webMeta)}>
                {card.publisher_handle ? `${t("discoverBy", { handle: card.publisher_handle })} · ` : null}
                {card.kind === "avatar" ? t("kindAvatar") : t("kindAccessory")}
              </div>
              {card.description ? (
                <div className={cn(libraryRow.meta, libraryRow.webMeta)}>{card.description}</div>
              ) : null}
            </div>
          </div>
          {card.is_added ? (
            <button
              type="button"
              disabled={busyId === card.id}
              onClick={() => void toggle(card)}
              aria-label={t("discoverRemove", { name: card.name })}
              title={t("discoverRemove", { name: card.name })}
              className={cn(libraryRow.webUnshare, libraryRow.unshare, libraryRow.unshareText)}
            >
              <Icon name="delete" size={18} />
            </button>
          ) : (
            <Button
              type="button"
              size="icon"
              disabled={busyId === card.id}
              onClick={() => void toggle(card)}
              aria-label={t("discoverAdd", { name: card.name })}
              title={t("discoverAdd", { name: card.name })}
              className="shrink-0"
            >
              <Icon name="add" size={18} />
            </Button>
          )}
        </div>
      ))}
      {error ? <div className={cn(formAlert.box, formAlert.text)}>{error}</div> : null}
    </Section>
  );
}
