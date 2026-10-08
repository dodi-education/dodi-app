import { type Href, Redirect, useLocalSearchParams } from "expo-router";

/** Legacy path (web: parent/personas/[id]/page): personas moved under Companions. */
export default function PersonaRedirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/parent/companions/personas/${id}` as Href} />;
}
