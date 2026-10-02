import { useLocalSearchParams } from "expo-router";

import { EditGameStudio } from "@/components/studio/edit-game-studio";

/**
 * A deep link straight into a studio tab, `/parent/game-studio/{id}/settings|code|preview`
 * (web: the optional [[...tab]] segment). An unknown segment falls back to the default tab.
 */
export default function EditGameStudioTabScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab: string }>();
  return <EditGameStudio id={id} tab={tab} />;
}
