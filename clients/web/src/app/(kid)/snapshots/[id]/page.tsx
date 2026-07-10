"use client";

import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { GamePlayView } from "@/components/games/game-play-view";
import { getCookie } from "@/lib/cookies";
import { ensureFriendKeys } from "@/lib/friends";
import {
  type DecodedSnapshotPayload,
  type SnapshotDetailView,
  decodeSnapshotPayload,
  fetchSnapshot,
  markSnapshotViewed,
} from "@/lib/snapshots";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import { EMPTY_SUCCESS_CRITERIA } from "@dodi/games/game-spec";

export default function SnapshotPlayPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("snapshots");

  const vaultSession = useVaultStore((s) => s.session);
  const [kidId, setKidId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState<SnapshotDetailView | null>(null);
  const [decoded, setDecoded] = useState<DecodedSnapshotPayload | null>(null);
  const [missing, setMissing] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const viewedRef = useRef(false);

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
          if (!cancelled) setMissing(true);
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
        const keys =
          detail.origin === "received"
            ? await ensureFriendKeys(kid, vaultSession)
            : null;
        const result = decodeSnapshotPayload(detail, vaultSession, keys);
        if (cancelled) return;
        setDecoded(result);
        // Clear the "new" badge on first open of a received snapshot.
        if (detail.origin === "received" && !detail.viewedAt && !viewedRef.current) {
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

  if (ready && !kidId) {
    return (
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dodi-800">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("kidRequired")}</p>
      </div>
    );
  }

  if (openFailed) {
    return (
      <div className="w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dodi-800">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("openFailed")}</p>
      </div>
    );
  }

  if (!decoded || !kidId) return null;

  const { payload, sanitizedCode } = decoded;

  return (
    <GamePlayView
      gameId={payload.gameId ?? id}
      kidId={kidId}
      title={payload.title}
      description={payload.gameTitle}
      codeBundle={sanitizedCode}
      markdown={payload.gameMarkdown}
      learningGoal=""
      successDefinition=""
      successCriteria={EMPTY_SUCCESS_CRITERIA}
      progressKind="open"
      capabilities={payload.capabilities}
      drawingStyle={payload.drawingStyle}
      snapshot={{ id, savedState: payload.savedState, gameId: payload.gameId }}
      inlineContext={{ title: payload.gameTitle, description: payload.gameDescription }}
    />
  );
}
