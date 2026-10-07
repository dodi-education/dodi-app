import { View } from "react-native";
import { useTranslations } from "use-intl";
import { splitSnapshotSections } from "@dodi/client-state/snapshots";
import { kidLibrary, kidLibraryState } from "@dodi/ui-recipes";

import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { cn } from "@/lib/cn";
import { useRefreshOnPull } from "@/lib/refresh-scope";
import { useSnapshots } from "@/lib/use-snapshots";

import { SnapshotCard } from "./snapshot-card";

/**
 * The kid's saved moments (web: components/snapshots/snapshot-library): "From
 * friends" first, then "My snapshots". Autosave slots never show here.
 */
export function SnapshotLibrary({ kidId }: { kidId: string }) {
  const t = useTranslations("snapshots");
  const { snapshots, loading, error, refresh, remove } = useSnapshots(kidId);
  // Pull to refresh (kid chrome): own and received snapshots.
  useRefreshOnPull("kid-snapshots", refresh);
  const { received, own } = splitSnapshotSections(snapshots);

  return (
    <View className={kidLibrary.root}>
      <View className={kidLibrary.head}>
        <View>
          <KidText className={kidLibrary.title} accessibilityRole="header">
            {t("title")}
          </KidText>
          <KidText className={kidLibrary.subtitle}>{t("subtitle")}</KidText>
        </View>
      </View>

      {loading ? (
        <View
          className={cn(kidLibraryState.spaced, kidLibraryState.loading)}
          style={kidShadowStyle("row")}
          accessibilityState={{ busy: true }}
        >
          <KidText className={kidLibraryState.loadingText}>{t("loading")}</KidText>
        </View>
      ) : error ? (
        <View className={cn(kidLibraryState.spaced, kidLibraryState.error)} accessibilityRole="alert">
          <KidText className={kidLibraryState.errorText}>{error === "locked" ? t("locked") : t("loadFailed")}</KidText>
        </View>
      ) : snapshots.length === 0 ? (
        <View className={cn(kidLibraryState.spaced, kidLibraryState.empty)}>
          <KidText className={kidLibraryState.emptyText}>{t("empty")}</KidText>
        </View>
      ) : (
        <>
          {received.length > 0 ? (
            <View>
              <KidText className={cn(kidLibrary.section, kidLibrary.sectionFirst)} accessibilityRole="header">
                {t("sectionFriends")}
              </KidText>
              <View className={kidLibrary.grid}>
                {received.map((snapshot) => (
                  <SnapshotCard key={snapshot.view.id} snapshot={snapshot} onDelete={(id) => void remove(id)} />
                ))}
              </View>
            </View>
          ) : null}
          {own.length > 0 ? (
            <View>
              <KidText className={cn(kidLibrary.section, kidLibrary.sectionNext)} accessibilityRole="header">
                {t("sectionMine")}
              </KidText>
              <View className={kidLibrary.grid}>
                {own.map((snapshot) => (
                  <SnapshotCard key={snapshot.view.id} snapshot={snapshot} onDelete={(id) => void remove(id)} />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
