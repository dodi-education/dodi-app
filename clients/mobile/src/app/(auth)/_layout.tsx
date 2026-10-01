import { Redirect, Stack } from "expo-router";

import { useSession } from "@/lib/session";

/** The signed-out area. A signed-in parent never sees it. */
export default function AuthLayout() {
  const isSignedIn = useSession((s) => s.isSignedIn);
  if (isSignedIn) return <Redirect href="/parent/dashboard" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
