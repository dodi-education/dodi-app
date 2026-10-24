import { useRouter } from "expo-router";
import { useTranslations } from "use-intl";
import { joinFamily } from "@dodi/client-state/family-members";

import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";
import { markSignedIn } from "@/lib/session";

/**
 * The last step of every join path, once the invited login is signed in (web:
 * auth/join/use-join): open the family's key with the link's secret, seal it
 * to the login's own key with its password, and land in the parent area.
 * Resolves with an error message, or null once on the way in.
 */
export function useFinishJoin(invitationId: string, secret: string): (password: string) => Promise<string | null> {
  const t = useTranslations("join");
  const router = useRouter();
  return async (password) => {
    const outcome = await joinFamily(
      {
        api,
        vault: clientState.vault,
        deviceKeystore: clientState.deviceKeystore,
        dropFamilyData: clientState.dropFamilyData,
      },
      { invitationId, secret, password },
    );
    if (outcome.kind === "error") return t(outcome.key);
    router.replace("/parent/dashboard");
    markSignedIn();
    return null;
  };
}
