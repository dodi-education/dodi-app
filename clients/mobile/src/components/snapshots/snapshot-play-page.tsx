import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { gamePlayPropsFromSnapshot } from "@dodi/client-state/game-play";
import {
  type DecodedSnapshotPayload,
  type SnapshotDetailView,
  fetchSnapshot,
  isNewSnapshot,
  markSnapshotViewed,
  openSnapshotPayload,
} from "@dodi/client-state/snapshots";

import { GamePlayNotice } from "@/components/kid-games/game-play-notice";
import { GamePlayView } from "@/components/kid-games/game-play-view";
import { clientState, useActiveKidStore, useVaultStore } from "@/lib/client-state";
import { snapshotDeps } from "@/lib/snapshots";

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "offline-unavailable" }
  | { kind: "loaded"; detail: SnapshotDetailView };

/**
 * Replay a saved snapshot (web: app/(kid)/snapshots/[id]): fetch the row,
 * decrypt the payload on the device once the vault is open (received rows
 * with the kid's friend keys), re-sanitize the embedded code, then play it
 * from the saved state. Opening a received snapshot clears its "new" badge.
 */
export function SnapshotPlayPage({ snapshotId }: { snapshotId: string }) {
  const t = useTranslations("snapshots");
  const kidId = useActiveKidStore((s) => s.activeKidId);
  const vaultSession = useVaultStore((s) => s.session);
  const [load, setLoad] = useState<{ id: string; state: LoadState }>({ id: snapshotId, state: { kind: "loading" } });
  const [decoded, setDecoded] = useState<{ id: string; payload: DecodedSnapshotPayload } | null>(null);
  const [isOpenFailed, setIsOpenFailed] = useState(false);
  const viewedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!kidId) return;
    let isCurrent = true;
    fetchSnapshot(snapshotDeps, snapshotId)
      .then((detail) => {
        if (isCurrent) setLoad({ id: snapshotId, state: { kind: "loaded", detail } });
      })
      .catch(() => {
        if (!isCurrent) return;
        // Offline without a cached payload is not a 404.
        const isOnline = clientState.connectivity.getState().isOnline;
        setLoad({ id: snapshotId, state: { kind: isOnline ? "missing" : "offline-unavailable" } });
      });
    return () => {
      isCurrent = false;
    };
  }, [snapshotId, kidId]);

  const detail = load.id === snapshotId && load.state.kind === "loaded" ? load.state.detail : null;

  useEffect(() => {
    if (!detail || !kidId || !vaultSession) return;
    let isCurrent = true;
    void (async () => {
      try {
        const kid = await clientState.kids.getState().loadOne(kidId);
        if (!kid) throw new Error("kid_not_found");
        const payload = await openSnapshotPayload(snapshotDeps, detail, kid, vaultSession);
        if (!isCurrent) return;
        setDecoded({ id: detail.id, payload });
        if (isNewSnapshot(detail) && viewedRef.current !== detail.id) {
          viewedRef.current = detail.id;
          void markSnapshotViewed(snapshotDeps, detail.id).catch(() => {});
        }
      } catch {
        if (isCurrent) setIsOpenFailed(true);
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [detail, kidId, vaultSession]);

  if (load.id === snapshotId && load.state.kind === "missing") return <Redirect href="/snapshots" />;
  if (load.id === snapshotId && load.state.kind === "offline-unavailable") {
    return <GamePlayNotice offlineText={t("offlineNotAvailable")} />;
  }
  if (!kidId) return <GamePlayNotice title={t("title")} body={t("kidRequired")} />;
  if (isOpenFailed) return <GamePlayNotice title={t("title")} body={t("openFailed")} />;
  if (!decoded || decoded.id !== snapshotId) return null;

  // The snapshot's own title, its saved state, open-ended progress and the
  // re-sanitized code (the only code that may reach the sandbox).
  return <GamePlayView key={snapshotId} kidId={kidId} {...gamePlayPropsFromSnapshot(snapshotId, decoded.payload)} />;
}
