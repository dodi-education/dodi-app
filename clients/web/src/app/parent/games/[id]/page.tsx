"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { GamePreview } from "@/components/parent/games/game-preview";
import { dodi } from "@/lib/api";
import type { DiscoverGameDetail, GameSharingState } from "@dodi/types/games";

/**
 * Parent preview of a PUBLISHED game at `/parent/games/{id}`. Both the game
 * content and this family's sharing state come from the plaintext Discover
 * endpoints, so — unlike the studio — there is no vault decryption step. An
 * unpublished or unknown id 404s (the detail endpoint is gated on
 * `published_at`), mirroring how the studio 404s a game the account can't edit.
 */
export default function ParentGamePreviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<{
    detail: DiscoverGameDetail;
    sharing: GameSharingState;
  } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [detailRes, sharingRes] = await Promise.all([
        dodi.request(`/api/discover/games/${id}`),
        dodi.request(`/api/discover/games/${id}/sharing`),
      ]);
      if (cancelled) return;
      if (!detailRes.ok) {
        setMissing(true);
        return;
      }
      const detail = (await detailRes.json()) as DiscoverGameDetail;
      // Sharing is a nicety (it seeds the "Share with kids" dialog); a failure
      // there falls back to an empty audience rather than blocking the preview.
      const sharing: GameSharingState = sharingRes.ok
        ? ((await sharingRes.json()) as { sharing: GameSharingState }).sharing
        : { family: false, kidIds: [] };
      if (cancelled) return;
      setData({ detail, sharing });
    }
    load().catch(() => {
      if (!cancelled) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) notFound();
  if (!data) return null;

  return <GamePreview detail={data.detail} sharing={data.sharing} />;
}
