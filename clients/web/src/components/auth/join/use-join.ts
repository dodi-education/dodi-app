"use client";

import { useTranslations } from "next-intl";

import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { joinFamily } from "@dodi/client-state/family-members";

/**
 * The last step of every join path, once the invited login is signed in:
 * open the family's key with the link's secret, seal it to the login's own
 * key with its password, and land in the parent area. Resolves with an error
 * message, or never (the page navigates away).
 */
export function useFinishJoin(invitationId: string, secret: string): (password: string) => Promise<string> {
  const t = useTranslations("join");
  return async (password) => {
    const outcome = await joinFamily(
      {
        api: dodi,
        vault: clientState.vault,
        deviceKeystore: clientState.deviceKeystore,
        dropFamilyData: clientState.dropFamilyData,
      },
      { invitationId, secret, password },
    );
    if (outcome.kind === "error") return t(outcome.key);
    // A full load: the parent area starts fresh in the joined family.
    window.location.assign("/parent/dashboard");
    return new Promise<string>(() => {});
  };
}
