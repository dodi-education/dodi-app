"use client";

import { useTranslations } from "next-intl";

import { splitSnapshotSections } from "@dodi/client-state/snapshots";
import { kidLibrary, kidLibraryState } from "@dodi/ui-recipes";

import { SnapshotCard } from "@/components/snapshots/snapshot-card";
import { useSnapshots } from "@/hooks/use-snapshots";
import { cn } from "@/lib/utils";

interface SnapshotLibraryProps {
  kidId: string;
}

export function SnapshotLibrary({ kidId }: SnapshotLibraryProps) {
  const t = useTranslations("snapshots");
  const { snapshots, loading, error, remove } = useSnapshots(kidId);

  const { received, own } = splitSnapshotSections(snapshots);

  return (
    <div className={kidLibrary.root}>
      <div className={cn(kidLibrary.webHead, kidLibrary.head)}>
        <div>
          <h1 className={kidLibrary.title}>
            {t("title")}
          </h1>
          <p className={kidLibrary.subtitle}>
            {t("subtitle")}
          </p>
        </div>
      </div>

      {loading && (
        <div
          className={cn(
            kidLibraryState.spaced,
            kidLibraryState.loading,
            kidLibraryState.loadingText,
            kidLibraryState.webLoading,
          )}
        >
          {t("loading")}
        </div>
      )}

      {!loading && error && (
        <div
          className={cn(
            kidLibraryState.spaced,
            kidLibraryState.error,
            kidLibraryState.errorText,
          )}
        >
          {error === "locked" ? t("locked") : t("loadFailed")}
        </div>
      )}

      {!loading && !error && snapshots.length === 0 && (
        <div
          className={cn(
            kidLibraryState.spaced,
            kidLibraryState.empty,
            kidLibraryState.emptyText,
          )}
        >
          {t("empty")}
        </div>
      )}

      {!loading && !error && received.length > 0 && (
        <section>
          <h2 className={cn(kidLibrary.section, kidLibrary.sectionFirst)}>
            {t("sectionFriends")}
          </h2>
          <div className={cn(kidLibrary.webGrid, kidLibrary.grid)}>
            {received.map((snapshot) => (
              <SnapshotCard
                key={snapshot.view.id}
                snapshot={snapshot}
                onDelete={(id) => void remove(id)}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && own.length > 0 && (
        <section>
          <h2 className={cn(kidLibrary.section, kidLibrary.sectionNext)}>
            {t("sectionMine")}
          </h2>
          <div className={cn(kidLibrary.webGrid, kidLibrary.grid)}>
            {own.map((snapshot) => (
              <SnapshotCard
                key={snapshot.view.id}
                snapshot={snapshot}
                onDelete={(id) => void remove(id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
