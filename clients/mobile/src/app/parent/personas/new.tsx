import { type Href, Redirect, useLocalSearchParams } from "expo-router";

/** Legacy path (web: parent/personas/new/page): personas moved under Companions. */
export default function NewPersonaRedirectScreen() {
  const params = useLocalSearchParams<{ import?: string }>();
  const href = params.import === "true" ? "/parent/companions/personas/new?import=true" : "/parent/companions/personas/new";
  return <Redirect href={href as Href} />;
}
