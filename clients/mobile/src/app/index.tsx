import { Redirect } from "expo-router";

import { useSession } from "@/lib/session";

/** Entry: signed-in parents land on their dashboard, everyone else signs in. */
export default function Index() {
  const isSignedIn = useSession((s) => s.isSignedIn);
  return <Redirect href={isSignedIn ? "/parent/dashboard" : "/login"} />;
}
