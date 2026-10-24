import { useLocalSearchParams } from "expo-router";

import { JoinFamily } from "@/components/join/join-family";

/**
 * A family invitation link: /join/{id}#k={secret} (web: (auth)/join/[id]).
 * Outside the (auth) group on purpose: a signed-in login may join too, and
 * signing in midway must not navigate away. The secret stays in the fragment.
 */
export default function JoinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JoinFamily invitationId={Array.isArray(id) ? id[0] : id} />;
}
