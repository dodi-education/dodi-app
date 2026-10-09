"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { AccessRequestCard } from "@/components/parent/access/access-request-card";
import { ConnectCodeForm } from "@/components/parent/access/connect-code-form";
import { Section } from "@/components/parent/section";
import { dodi } from "@/lib/api";
import {
  ACCESS_REQUEST_ERROR_KEYS,
  claimAccessRequest,
  type AccessRequest,
} from "@dodi/client-state/authorized-clients";
import { sectionMessage } from "@dodi/ui-recipes";

/**
 * "Allow access" (/parent/authorize?code=…): looks the robot's or agent's code
 * up, then shows its card. Without a code (or after a failed lookup) it asks
 * for one. Deciding returns to Settings > Access.
 */
export function AuthorizeAccess({ code }: { code: string }) {
  const t = useTranslations("access");
  const router = useRouter();
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(code.trim() !== "");
  const [error, setError] = useState<string | null>(null);
  const hasLookedUp = useRef(false);

  useEffect(() => {
    if (hasLookedUp.current || !code.trim()) return;
    hasLookedUp.current = true;
    void claimAccessRequest({ api: dodi }, code).then((result) => {
      setIsLookingUp(false);
      if (typeof result === "string") setError(t(ACCESS_REQUEST_ERROR_KEYS[result]));
      else setRequest(result);
    });
  }, [code, t]);

  function handleDone(isAllowed: boolean) {
    const result = !isAllowed ? "declined" : request?.kind === "agent" ? "allowedAgent" : "allowed";
    router.replace(`/parent/settings/access?result=${result}`);
  }

  return (
    <Section title={t("authorizeTitle")} desc={request ? undefined : t("authorizeDesc")}>
      {request ? (
        <AccessRequestCard key={request.id} request={request} onDone={handleDone} />
      ) : isLookingUp ? (
        <div className="px-5 py-6">
          <p role="status" className={sectionMessage.text}>
            {t("lookingUp")}
          </p>
        </div>
      ) : (
        <ConnectCodeForm id="authorize" label={t("pairingCode")} error={error} />
      )}
    </Section>
  );
}
