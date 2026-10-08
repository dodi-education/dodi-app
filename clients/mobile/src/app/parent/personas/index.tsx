import { type Href, Redirect } from "expo-router";

/** Legacy path (web: parent/personas/page): personas are a tab of Companions now. */
export default function PersonasRedirectScreen() {
  return <Redirect href={"/parent/companions?tab=personas" as Href} />;
}
