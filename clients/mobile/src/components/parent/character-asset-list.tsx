import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { assetPublicationStateKey } from "@dodi/client-state/character-asset-publication";
import type { CharacterAssetEntry } from "@dodi/client-state/character-asset-store";

import { SectionFormError } from "@/components/parent/form-error";
import { Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button, Icon } from "@/components/ui";
import { useAssetPublicationStore, useCharacterAssetStore } from "@/lib/client-state";

import { CharacterAssetShareDialog } from "./character-asset-share-dialog";

/**
 * The family's own avatars and accessories (made with the dodi CLI) and the
 * ones it added from Discover, with a delete (own) or remove (added) per row
 * (tap twice) and "Share on Discover" for own ones, showing their review
 * state. Hidden while there are none. Web: components/parent/character-asset-list.
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

  async function handleDelete(asset: CharacterAssetEntry): Promise<void> {
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

  function deleteLabelOf(asset: CharacterAssetEntry): string {
    if (deletingId === asset.id) return asset.isShared ? t("removing") : t("deleting");
    if (confirmingId === asset.id) return asset.isShared ? t("confirmRemove") : t("confirmDelete");
    return asset.isShared ? t("remove") : t("delete");
  }

  if (!assets || assets.length === 0) {
    return error ? (
      <Section>
        <SectionFormError>{error}</SectionFormError>
      </Section>
    ) : null;
  }

  return (
    <>
      <Section title={t("title")} desc={t("description")}>
        {assets.map((asset) => {
          const stateKey = stateKeyOf(asset);
          return (
            <Row key={asset.id}>
              <View className="size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft">
                <Icon name={asset.kind === "avatar" ? "personas" : "sparkles"} size={16} color="primary" />
              </View>
              <RowMain>
                <RowTitle>
                  <RowTitleText>{asset.name}</RowTitleText>
                </RowTitle>
                <RowMeta numberOfLines={1}>
                  {asset.kind === "avatar" ? t("kindAvatar") : t("kindAccessory")} ·{" "}
                  {asset.isShared
                    ? asset.publisherHandle
                      ? t("sharedBy", { handle: asset.publisherHandle })
                      : t("sharedFromDiscover")
                    : t("size", { size: Math.max(1, Math.round(asset.byteSize / 1024)) })}
                  {stateKey ? ` · ${t(stateKey)}` : null}
                </RowMeta>
              </RowMain>
              {asset.isShared ? null : (
                <Button
                  variant="outline"
                  size="icon"
                  icon="world_up"
                  accessibilityLabel={t("shareLabel", { name: asset.name })}
                  onPress={() => setSharing(asset)}
                />
              )}
              <Button
                variant={confirmingId === asset.id ? "destructive" : "outline"}
                size="sm"
                disabled={deletingId === asset.id}
                onPress={() => void handleDelete(asset)}
              >
                {deleteLabelOf(asset)}
              </Button>
            </Row>
          );
        })}
        {error ? <SectionFormError>{error}</SectionFormError> : null}
      </Section>
      {/* Outside the Section: it wraps every child in a divided row. */}
      <CharacterAssetShareDialog asset={sharing} isOpen={sharing !== null} onClose={() => setSharing(null)} />
    </>
  );
}
