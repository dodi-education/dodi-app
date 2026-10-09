import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  groupAccess,
  loadAuthorizedClients,
  revokeAccess,
  type AuthorizedClientView,
} from "@dodi/client-state/authorized-clients";
import { access } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Button, Dialog, Text } from "@/components/ui";
import { useRefreshOnPull } from "@/lib/refresh-scope";
import { signOut } from "@/lib/session";

import { accessDeps, currentDeviceId } from "./access-deps";
import { AccessKeyDialog } from "./access-key-dialog";
import { AgentStarter } from "./agent-starter";
import { ClientSection } from "./client-section";
import { ConnectCodeForm } from "./connect-code-form";

/** What "Allow access" reports back after the parent decided (`result` param). */
export type AccessResult = "allowed" | "allowedAgent" | "declined";

/**
 * Settings > Access (web: access/access-settings): everything that can open
 * the family vault, each with its status and a one-step Revoke. Revoking this
 * very app signs it out.
 */
export function AccessSettings({ result }: { result: AccessResult | null }) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const router = useRouter();
  const [clients, setClients] = useState<AuthorizedClientView[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmClient, setConfirmClient] = useState<AuthorizedClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(result ? t(result) : null);
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);

  const reload = useCallback(async () => {
    setClients(await loadAuthorizedClients(api, await currentDeviceId()));
  }, []);
  // Pull to refresh (the settings page): the list and its last-used times.
  useRefreshOnPull("access", reload);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function endSession(): Promise<void> {
    await signOut();
    router.replace("/login");
  }

  async function revoke(client: AuthorizedClientView): Promise<void> {
    setConfirmClient(null);
    setError(null);
    setNotice(null);
    setRevokingId(client.id);
    const outcome = await revokeAccess(accessDeps(), client);
    setRevokingId(null);
    if (!outcome.ok) {
      setError(t("revokeFailed"));
      return;
    }
    if (outcome.wasCurrent) {
      await endSession();
      return;
    }
    setNotice(t("revoked"));
    await reload();
  }

  const groups = clients ? groupAccess(clients) : null;
  const rowProps = { loadingText: t("loading"), revokingId, onRevoke: setConfirmClient };

  return (
    <>
      <Text className={access.subtitle}>{t("subtitle")}</Text>
      {error || notice ? (
        <Text className={`mb-6 ${error ? access.error : access.success}`} accessibilityRole={error ? "alert" : "text"}>
          {error ?? notice}
        </Text>
      ) : null}
      <ClientSection
        title={t("thisDeviceTitle")}
        clients={groups ? (groups.current ? [groups.current] : []) : null}
        emptyText={t("thisDeviceUnlisted")}
        {...rowProps}
      >
        <View className={access.block}>
          <Button variant="outline" icon="logout" onPress={() => void endSession()}>
            {tc("signOut")}
          </Button>
        </View>
      </ClientSection>
      <ClientSection
        title={t("browsersTitle")}
        desc={t("browsersDesc")}
        clients={groups?.browsersAndApps ?? null}
        emptyText={t("browsersEmpty")}
        {...rowProps}
      />
      <ClientSection
        title={t("robotTitle")}
        desc={t("robotDesc")}
        clients={groups?.robots ?? null}
        emptyText={t("robotEmpty")}
        {...rowProps}
      >
        <ConnectCodeForm label={t("connectRobot")} />
      </ClientSection>
      <ClientSection
        title={t("agentsTitle")}
        desc={t("agentsDesc")}
        clients={groups?.agents ?? null}
        emptyText={t("agentsEmpty")}
        action={
          <Button variant="outline" size="sm" icon="add" onPress={() => setIsKeyDialogOpen(true)}>
            {t("keyTitle")}
          </Button>
        }
        {...rowProps}
      >
        <ConnectCodeForm label={t("connectAgent")} />
      </ClientSection>
      <AccessKeyDialog isOpen={isKeyDialogOpen} onClose={() => setIsKeyDialogOpen(false)} onCreated={() => void reload()} />
      <AgentStarter />

      {/* web: window.confirm(confirmRevoke) */}
      <Dialog
        isOpen={confirmClient !== null}
        onClose={() => setConfirmClient(null)}
        title={t("revoke")}
        description={t(confirmClient?.is_current ? "confirmRevokeCurrent" : "confirmRevoke")}
        footer={
          <>
            <Button variant="destructive" onPress={() => confirmClient && void revoke(confirmClient)}>
              {t("revoke")}
            </Button>
            <Button variant="outline" onPress={() => setConfirmClient(null)}>
              {tc("cancel")}
            </Button>
          </>
        }
      />
    </>
  );
}
