import { Redirect } from "expo-router";

/** Legacy path: Event logs → Activities (web: parent/event-logs redirects too). */
export default function EventLogsRedirectScreen() {
  return <Redirect href="/parent/activities" />;
}
