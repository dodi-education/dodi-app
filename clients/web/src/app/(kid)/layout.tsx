import { headers } from "next/headers";

import { KidChrome } from "@/components/kid/kid-chrome";

/**
 * Signed-in visitors get the full kid experience (KidChrome: header, gating,
 * bottom nav). Anonymous visitors render bare children — middleware only lets
 * them reach /games/[id] here, whose server page renders the public game view
 * with its own header/footer. The auth signal is the `x-dodi-authed` request
 * header stamped by middleware after the session refresh, so a stale cookie
 * can never flip this the wrong way.
 */
export default async function KidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = (await headers()).get("x-dodi-authed") === "1";
  if (!authed) return <>{children}</>;
  return <KidChrome>{children}</KidChrome>;
}
