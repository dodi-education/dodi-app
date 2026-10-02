"use client";

import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { GamePlayView } from "@/components/games/game-play-view";
import { Icon } from "@/components/shared/icon";
import { getCookie } from "@/lib/cookies";
import {
  type DecodedSnapshotPayload,
  type SnapshotDetailView,
  fetchSnapshot,
  markSnapshotViewed,
  snapshotDeps,
} from "@/lib/snapshots";
import { isCurrentlyOnline } from "@/stores/connectivity-store";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import { cn } from "@/lib/utils";
import { gamePlayNotice } from "@dodi/ui-recipes";
import { gamePlayPropsFromSnapshot } from "@dodi/client-state/game-play";
import {
  isNewSnapshot,
  openSnapshotPayload,
} from "@dodi/client-state/snapshots";

export default function SnapshotPlayPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations("snapshots");

  const vaultSession = useVaultStore((s) => s.session);
  const [kidId, setKidId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState<SnapshotDetailView | null>(null);
  const [decoded, setDecoded] = useState<DecodedSnapshotPayload | null>(null);
  const [missing, setMissing] = useState(false);
  const [offlineUnavailable, setOfflineUnavailable] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const viewedRef = useRef(false);

  // The service worker serves ONE cached detail shell for every
  // /snapshots/<id> URL offline, so the hydrated route params may belong to a
  // different id — the URL is the truth. This page must keep rendering
  // nothing until the effects resolve; that's what makes the shell
  // substitution invisible (see public/sw.js detail-shell caching).
  const id =
    (typeof window !== "undefined"
      ? /^\/snapshots\/([^/]+)\/?$/.exec(window.location.pathname)?.[1]
      : undefined) ?? params.id;

  useEffect(() => {
    const pid = getCookie("dodi-active-kid");
    let cancelled = false;

    // Init from the cookie after mount, deferred off the synchronous effect tick
    // (avoids the cascading-render lint and SSR/hydration skew from `document`).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setKidId(pid);
      setReady(true);
    });

    if (pid) {
      fetchSnapshot(id)
        .then((snapshot) => {
          if (!cancelled) setDetail(snapshot);
        })
        .catch(() => {
          if (cancelled) return;
          // Offline with no cached payload is not a 404 — the snapshot
          // exists, it just isn't saved for offline.
          if (!isCurrentlyOnline()) setOfflineUnavailable(true);
          else setMissing(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Decode client-side once the row + unlocked vault + kid are available. The
  // embedded game code is re-sanitized before it can reach the sandbox.
  useEffect(() => {
    if (!detail || !kidId || !vaultSession) return;
    let cancelled = false;
    void (async () => {
      try {
        const kid = await useKidStore.getState().loadOne(kidId);
        if (!kid) throw new Error("kid_not_found");
        // Received rows open with the kid's friend keys, own rows the vault.
        const result = await openSnapshotPayload(snapshotDeps, detail, kid, vaultSession);
        if (cancelled) return;
        setDecoded(result);
        // Clear the "new" badge on first open of a received snapshot.
        if (isNewSnapshot(detail) && !viewedRef.current) {
          viewedRef.current = true;
          void markSnapshotViewed(id).catch(() => {});
        }
      } catch {
        if (!cancelled) setOpenFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail, kidId, vaultSession, id]);

  if (missing) notFound();

  if (offlineUnavailable) {
    return (
      <div className={cn(gamePlayNotice.box, gamePlayNotice.web)}>
        <Icon
          name="wifi_off"
          size={28}
          className={gamePlayNotice.webIcon}
        />
        <p className={gamePlayNotice.text}>
          {t("offlineNotAvailable")}
        </p>
      </div>
    );
  }

  if (ready && !kidId) {
    return (
      <div className={cn(gamePlayNotice.box, gamePlayNotice.web)}>
        <h1 className={gamePlayNotice.title}>{t("title")}</h1>
        <p className={gamePlayNotice.body}>{t("kidRequired")}</p>
      </div>
    );
  }

  if (openFailed) {
    return (
      <div className={cn(gamePlayNotice.box, gamePlayNotice.web)}>
        <h1 className={gamePlayNotice.title}>{t("title")}</h1>
        <p className={gamePlayNotice.body}>{t("openFailed")}</p>
      </div>
    );
  }

  if (!decoded || !kidId) return null;

  // The snapshot's own title, its saved state, open-ended progress and the
  // re-sanitized code (the only code that may reach the sandbox).
  return <GamePlayView kidId={kidId} {...gamePlayPropsFromSnapshot(id, decoded)} />;
}
