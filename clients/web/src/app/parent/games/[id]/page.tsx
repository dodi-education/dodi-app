"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

import { GamePreview } from "@/components/parent/games/game-preview";
import { dodi } from "@/lib/api";
import { type DiscoverPreview, loadDiscoverPreview } from "@dodi/client-state/game-sharing";

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
  const locale = useLocale();

  const [data, setData] = useState<DiscoverPreview | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // locale localizes the system games (the only translated Discover rows).
    // A sharing failure falls back to an empty audience inside the load.
    async function load() {
      const preview = await loadDiscoverPreview(dodi, id, locale);
      if (cancelled) return;
      if (!preview) setMissing(true);
      else setData(preview);
    }
    load().catch(() => {
      if (!cancelled) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, locale]);

  if (missing) notFound();
  if (!data) return null;

  return <GamePreview detail={data.detail} sharing={data.sharing} />;
}
