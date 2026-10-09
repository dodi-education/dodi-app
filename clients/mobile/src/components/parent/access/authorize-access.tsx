import { type Href, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  ACCESS_REQUEST_ERROR_KEYS,
  claimAccessRequest,
  type AccessRequest,
} from "@dodi/client-state/authorized-clients";
import { sectionMessage } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Section } from "@/components/parent/section";
import { Text } from "@/components/ui";

import { AccessRequestCard } from "./access-request-card";
import { ConnectCodeForm } from "./connect-code-form";

/**
 * "Allow access" (web: access/authorize-access): looks the robot's or agent's
 * code up, then shows its card. Without a code (or after a failed lookup) it
 * asks for one. Deciding returns to Settings > Access.
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
    void claimAccessRequest({ api }, code).then((result) => {
      setIsLookingUp(false);
      if (typeof result === "string") setError(t(ACCESS_REQUEST_ERROR_KEYS[result]));
      else setRequest(result);
    });
  }, [code, t]);

  function handleDone(isAllowed: boolean): void {
    const result = !isAllowed ? "declined" : request?.kind === "agent" ? "allowedAgent" : "allowed";
    router.replace(`/parent/settings/access?result=${result}` as Href);
  }

  return (
    <Section title={t("authorizeTitle")} desc={request ? undefined : t("authorizeDesc")}>
      {request ? (
        <AccessRequestCard key={request.id} request={request} onDone={handleDone} />
      ) : isLookingUp ? (
        <View className="px-5 py-6">
          <Text className={sectionMessage.text} accessibilityRole="text">
            {t("lookingUp")}
          </Text>
        </View>
      ) : (
        <ConnectCodeForm label={t("pairingCode")} error={error} />
      )}
    </Section>
  );
}
