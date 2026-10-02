import { useLocalSearchParams } from "expo-router";

import { GamePlayPage } from "@/components/kid-games/game-play-page";

/**
 * Play a game (web: app/(kid)/games/[id]/page, the signed-in branch). The kid
 * chrome gives /games/[id] its non-scrolling full mode, so touch games keep
 * their gestures.
 */
export default function KidGamePlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GamePlayPage key={id} gameId={id} />;
}
