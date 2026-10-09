import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import type { DiscoverAssetCard } from "@dodi/client-state/discover-character-assets";
import { libraryPill as p, libraryRow as r } from "@dodi/ui-recipes";

import { FormAlert } from "@/components/games-library/form-alert";
import { Section } from "@/components/parent/section";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useDiscoverAssetStore } from "@/lib/client-state";
import { useRefreshOnPull } from "@/lib/refresh-scope";

/**
 * "Discover avatars and accessories" on the parent Discover page: live
 * assets other families published, plaintext by design. Add writes this
 * family's sharing row (play-in-place, nothing is copied) so kids can wear it
 * in the Playground; once added, the red trash removes it again. Hidden while
 * there are none. Web: components/parent/discover-asset-list.
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

  // Pull to refresh (the games page): the list again, past the cache.
  useRefreshOnPull("discover-assets", async () => {
    await load(true);
    setError(null);
  });

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
        <FormAlert>{error}</FormAlert>
      </Section>
    ) : null;
  }

  return (
    <Section title={t("discoverTitle")} desc={t("discoverDescription")}>
      <View>
        {cards.map((card, i) => (
          <View key={card.id} className={cn(r.box, i === cards.length - 1 && r.last)}>
            <View className={r.body}>
              {card.preview_image ? (
                <Image
                  source={{ uri: card.preview_image }}
                  className={r.thumb}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                  // Decorative: the name beside it names the item.
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              ) : (
                <View className={cn(r.thumbFallback, r.thumbKind)}>
                  <Icon name={card.kind === "avatar" ? "personas" : "sparkles"} size={28} color="primary" />
                </View>
              )}
              <View className={r.main}>
                <View className={r.titleRow}>
                  <Text className={cn(r.title, "shrink")} numberOfLines={1}>
                    {card.name}
                  </Text>
                  {card.is_added ? (
                    <View className={cn(p.withIcon, p.box, p.primary)}>
                      <Icon name="check" size={11} stroke={3} color="primary" />
                      <Text className={cn(p.text, p.primaryText)}>{t("discoverAdded")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className={r.meta} numberOfLines={1}>
                  {card.publisher_handle ? `${t("discoverBy", { handle: card.publisher_handle })} · ` : ""}
                  {card.kind === "avatar" ? t("kindAvatar") : t("kindAccessory")}
                </Text>
                {card.description ? (
                  <Text className={r.meta} numberOfLines={1}>
                    {card.description}
                  </Text>
                ) : null}
              </View>
            </View>
            {card.is_added ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("discoverRemove", { name: card.name })}
                accessibilityState={{ disabled: busyId === card.id }}
                disabled={busyId === card.id}
                hitSlop={4}
                onPress={() => void toggle(card)}
                className={cn(r.unshare, busyId === card.id && "opacity-50", "active:opacity-80")}
              >
                <Icon name="delete" size={18} color="primary-foreground" />
              </Pressable>
            ) : (
              <Button
                size="icon"
                accessibilityLabel={t("discoverAdd", { name: card.name })}
                hitSlop={4}
                disabled={busyId === card.id}
                onPress={() => void toggle(card)}
              >
                <Icon name="add" size={18} color="primary-foreground" />
              </Button>
            )}
          </View>
        ))}
      </View>
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Section>
  );
}
