import { Redirect } from "expo-router";

/** Settings opens on General (web: parent/settings/page redirects the same way). */
export default function SettingsIndexScreen() {
  return <Redirect href="/parent/settings/general" />;
}
