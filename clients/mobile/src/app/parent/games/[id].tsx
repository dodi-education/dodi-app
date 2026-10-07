import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useLocale } from "use-intl";
import { type DiscoverPreview, loadDiscoverPreview } from "@dodi/client-state/game-sharing";

import { api } from "@/adapters/platform";
import { GamePreview } from "@/components/games-library/game-preview";
import { useRefreshOnPull } from "@/lib/refresh-scope";

/**
 * Parent preview of a PUBLISHED game (web: parent/games/[id]/page). Content
 * and this family's sharing come from the plaintext Discover endpoints, so
 * there is no vault step. An unpublished or unknown id goes back to the list
 * (the web 404s).
 */
export default function ParentGamePreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const locale = useLocale();
  const [data, setData] = useState<DiscoverPreview | null>(null);
  const [isMissing, setIsMissing] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    // The locale localizes the system games (the only translated Discover rows).
    loadDiscoverPreview(api, id, locale)
      .then((preview) => {
        if (!isCurrent) return;
        if (preview) setData(preview);
        else setIsMissing(true);
      })
      .catch(() => {
        if (isCurrent) setIsMissing(true);
      });
    return () => {
      isCurrent = false;
    };
  }, [id, locale]);

  // Pull to refresh (the Infos tab): the listing and this family's sharing.
  // A failed reload keeps what's shown.
  useRefreshOnPull("game-preview", async () => {
    const preview = await loadDiscoverPreview(api, id, locale);
    if (preview) setData(preview);
  });

  if (isMissing) return <Redirect href="/parent/games" />;
  if (!data) return null;
  return <GamePreview detail={data.detail} sharing={data.sharing} />;
}
