"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { assetPublicationStateKey } from "@dodi/client-state/character-asset-publication";
import type { CharacterAssetEntry } from "@dodi/client-state/character-asset-store";
import { sectionFormError } from "@dodi/ui-recipes";

import { CharacterAssetShareDialog } from "@/components/parent/character-asset-share-dialog";

import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssetPublicationStore, useCharacterAssetStore } from "@/stores/character-asset-store";

/**
 * The family's own avatars and accessories (made with the dodi CLI) and the
 * ones it added from Discover, with a delete (own) or remove (added) per row
 * (tap twice) and "Share on Discover" for own ones, showing their review
 * state. Hidden while there are none. Mobile: components/parent/character-asset-list.
 */
export function CharacterAssetList() {
  const t = useTranslations("characterAssets");
  const assets = useCharacterAssetStore((s) => s.assets);
  const load = useCharacterAssetStore((s) => s.load);
  const remove = useCharacterAssetStore((s) => s.remove);
  const publications = useAssetPublicationStore((s) => s.byAssetId);
  const loadPublication = useAssetPublicationStore((s) => s.load);
  const [sharing, setSharing] = useState<CharacterAssetEntry | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load().catch(() => setError(t("loadFailed")));
  }, [load, t]);

  // Each own asset's Discover state, once per session (cached in the store).
  useEffect(() => {
    for (const asset of assets ?? []) {
      if (!asset.isShared) void loadPublication(asset.id).catch(() => {});
    }
  }, [assets, loadPublication]);

  async function handleDelete(asset: CharacterAssetEntry) {
    if (confirmingId !== asset.id) {
      setConfirmingId(asset.id);
      return;
    }
    setError(null);
    setDeletingId(asset.id);
    try {
      await remove(asset.id);
    } catch {
      setError(asset.isShared ? t("removeFailed") : t("deleteFailed"));
    }
    setDeletingId(null);
    setConfirmingId(null);
  }

  const stateKeyOf = (asset: CharacterAssetEntry): string | null =>
    asset.isShared ? null : assetPublicationStateKey(publications[asset.id]);

  function publicationStateLabel(asset: CharacterAssetEntry): string | null {
    const key = stateKeyOf(asset);
    return key ? ` · ${t(key)}` : null;
  }

  function deleteLabelOf(asset: CharacterAssetEntry): string {
    if (deletingId === asset.id) return asset.isShared ? t("removing") : t("deleting");
    if (confirmingId === asset.id) return asset.isShared ? t("confirmRemove") : t("confirmDelete");
    return asset.isShared ? t("remove") : t("delete");
  }

  if (!assets || assets.length === 0) {
    return error ? (
      <Section>
        <p className={cn(sectionFormError.box, sectionFormError.text)}>{error}</p>
      </Section>
    ) : null;
  }

  return (
    <Section title={t("title")} desc={t("description")}>
      {assets.map((asset) => (
        <Row key={asset.id}>
          <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name={asset.kind === "avatar" ? "personas" : "sparkles"} size={16} />
          </div>
          <RowMain>
            <RowTitle>{asset.name}</RowTitle>
            <RowMeta>
              {asset.kind === "avatar" ? t("kindAvatar") : t("kindAccessory")} ·{" "}
              {asset.isShared
                ? asset.publisherHandle
                  ? t("sharedBy", { handle: asset.publisherHandle })
                  : t("sharedFromDiscover")
                : t("size", { size: Math.max(1, Math.round(asset.byteSize / 1024)) })}
              {publicationStateLabel(asset)}
            </RowMeta>
          </RowMain>
          {asset.isShared ? null : (
            <Button
              variant="outline"
              size="icon"
              aria-label={t("shareLabel", { name: asset.name })}
              title={t("shareLabel", { name: asset.name })}
              onClick={() => setSharing(asset)}
            >
              <Icon name="world_up" size={16} />
            </Button>
          )}
          <Button
            variant={confirmingId === asset.id ? "destructive" : "outline"}
            size="sm"
            disabled={deletingId === asset.id}
            onClick={() => void handleDelete(asset)}
          >
            {deleteLabelOf(asset)}
          </Button>
        </Row>
      ))}
      {error ? <p className={cn(sectionFormError.box, sectionFormError.text)}>{error}</p> : null}
      <CharacterAssetShareDialog asset={sharing} open={sharing !== null} onClose={() => setSharing(null)} />
    </Section>
  );
}
