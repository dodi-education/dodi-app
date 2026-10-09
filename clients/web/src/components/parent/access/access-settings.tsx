"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { AccessKeyDialog } from "@/components/parent/access/access-key-dialog";
import { accessDeps, currentDeviceId } from "@/components/parent/access/access-deps";
import { AgentStarter } from "@/components/parent/access/agent-starter";
import { ClientSection } from "@/components/parent/access/client-section";
import { ConnectCodeForm } from "@/components/parent/access/connect-code-form";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { endSession } from "@/lib/auth/end-session";
import { cn } from "@/lib/utils";
import {
  groupAccess,
  loadAuthorizedClients,
  revokeAccess,
  type AuthorizedClientView,
} from "@dodi/client-state/authorized-clients";
import { access } from "@dodi/ui-recipes";

/** What "Allow access" reports back after the parent decided (`?result=`). */
export type AccessResult = "allowed" | "allowedAgent" | "declined";

/**
 * Settings > Access: everything that can open the family vault, in this order:
 * agents and access keys (with Get started), the robot, this browser, other
 * browsers and the app. Each entry has its status and a one-step Revoke.
 * Revoking this very browser signs it out.
 */
export function AccessSettings({ result }: { result: AccessResult | null }) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const router = useRouter();
  const [clients, setClients] = useState<AuthorizedClientView[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(result ? t(result) : null);
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setClients(await loadAuthorizedClients(dodi, await currentDeviceId()));
  }, []);

  useEffect(() => {
    // Deferred a microtask so the fetch's setState doesn't run synchronously on
    // the effect tick (cascading-render lint).
    void Promise.resolve().then(load);
  }, [load]);

  async function signOut() {
    await endSession();
    router.push("/login");
    router.refresh();
  }

  async function revoke(client: AuthorizedClientView) {
    if (!window.confirm(t(client.is_current ? "confirmRevokeCurrent" : "confirmRevoke"))) return;
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
      await signOut();
      return;
    }
    setNotice(t("revoked"));
    await load();
  }

  const groups = clients ? groupAccess(clients) : null;
  const rowProps = { loadingText: t("loading"), revokingId, onRevoke: (c: AuthorizedClientView) => void revoke(c) };

  return (
    <>
      <p className={access.subtitle}>{t("subtitle")}</p>
      {error || notice ? (
        <p role={error ? "alert" : "status"} className={cn("mb-6", error ? access.error : access.success)}>
          {error ?? notice}
        </p>
      ) : null}
      <ClientSection
        title={t("agentsTitle")}
        desc={t("agentsDesc")}
        clients={groups?.agents ?? null}
        emptyText={t("agentsEmpty")}
        action={
          <Button variant="outline" size="sm" onClick={() => setIsKeyDialogOpen(true)}>
            <Icon name="add" size={14} />
            {t("keyTitle")}
          </Button>
        }
        {...rowProps}
      >
        <ConnectCodeForm id="agent" label={t("connectAgent")} />
      </ClientSection>
      <AccessKeyDialog isOpen={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen} onCreated={() => void load()} />
      <AgentStarter />
      <ClientSection
        title={t("robotTitle")}
        desc={t("robotDesc")}
        clients={groups?.robots ?? null}
        emptyText={t("robotEmpty")}
        {...rowProps}
      >
        <ConnectCodeForm id="robot" label={t("connectRobot")} />
      </ClientSection>
      <ClientSection
        title={t("thisDeviceTitle")}
        clients={groups ? (groups.current ? [groups.current] : []) : null}
        emptyText={t("thisDeviceUnlisted")}
        {...rowProps}
      >
        <div className={cn("flex", access.block)}>
          <Button variant="outline" className="min-h-11 sm:self-end" onClick={() => void signOut()}>
            <Icon name="logout" size={16} />
            {tc("signOut")}
          </Button>
        </div>
      </ClientSection>
      <ClientSection
        title={t("browsersTitle")}
        desc={t("browsersDesc")}
        clients={groups?.browsersAndApps ?? null}
        emptyText={t("browsersEmpty")}
        {...rowProps}
      />
    </>
  );
}
