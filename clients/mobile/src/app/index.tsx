import { Redirect } from "expo-router";

import { readLastView } from "@/adapters/platform";
import { useSession } from "@/lib/session";

/**
 * Entry: signed-in devices reopen the view they were last in (a kid's cold
 * start, offline included, lands back in the kid view; web: start_url /home),
 * parents land on their dashboard, everyone else signs in.
 */
export default function Index() {
  const isSignedIn = useSession((s) => s.isSignedIn);
  if (!isSignedIn) return <Redirect href="/login" />;
  return <Redirect href={readLastView() === "kid" ? "/home" : "/parent/dashboard"} />;
}
