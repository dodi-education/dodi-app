"use client";

import { useTranslations } from "next-intl";

import { SnapshotCard } from "@/components/snapshots/snapshot-card";
import { useSnapshots } from "@/hooks/use-snapshots";

interface SnapshotLibraryProps {
  kidId: string;
}

export function SnapshotLibrary({ kidId }: SnapshotLibraryProps) {
  const t = useTranslations("snapshots");
  const { snapshots, loading, error, remove } = useSnapshots(kidId);

  const received = snapshots.filter((s) => s.view.origin === "received");
  const own = snapshots.filter((s) => s.view.origin === "own");

  return (
    <div className="w-full max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[27px] font-extrabold tracking-tight text-ink">
            {t("title")}
          </h1>
          <p className="mt-0.5 text-sm font-semibold text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {loading && (
        <div className="mt-6 rounded-[20px] bg-white p-6 text-sm font-semibold text-muted-foreground shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
          {t("loading")}
        </div>
      )}

      {!loading && error && (
        <div className="mt-6 rounded-[20px] bg-danger-soft p-6 text-sm font-semibold text-danger">
          {error === "locked" ? t("locked") : t("loadFailed")}
        </div>
      )}

      {!loading && !error && snapshots.length === 0 && (
        <div className="mt-6 rounded-[20px] bg-white/70 p-5 text-sm font-semibold text-muted-foreground">
          {t("empty")}
        </div>
      )}

      {!loading && !error && received.length > 0 && (
        <section>
          <h2 className="mb-3 mt-5 text-[13px] font-extrabold tracking-[0.07em] text-faint uppercase">
            {t("sectionFriends")}
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
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
          <h2 className="mb-3 mt-6 text-[13px] font-extrabold tracking-[0.07em] text-faint uppercase">
            {t("sectionMine")}
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
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
