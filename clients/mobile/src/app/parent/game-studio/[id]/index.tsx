import { useLocalSearchParams } from "expo-router";

import { EditGameStudio } from "@/components/studio/edit-game-studio";

/**
 * A saved game in the studio, at `/parent/game-studio/{id}` (web:
 * parent/game-studio/[id]/[[...tab]]/page without a tab). Notifications about
 * a build open this route.
 */
export default function EditGameStudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditGameStudio id={id} />;
}
