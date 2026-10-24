"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dodi } from "@/lib/api";
import { endSession } from "@/lib/auth/end-session";
import { getSessionUser } from "@/lib/auth/client";
import {
  inviteSecretFromHash,
  loadInvitationPreview,
  type InvitationPreview,
} from "@dodi/client-state/family-members";

import { JoinConfirmPassword } from "./join-confirm-password";
import { JoinNewLogin } from "./join-new-login";
import { JoinSignIn } from "./join-sign-in";

type Stage =
  | { kind: "loading" }
  | { kind: "unavailable"; messageKey: "joinUsed" | "joinExpired" | "joinNotFound" | "joinLinkIncomplete" }
  | { kind: "ready"; invitation: InvitationPreview; secret: string; signedInEmail: string | null };

/**
 * Joining a family from an invitation link: the invited person creates a
 * login (or signs in with theirs), confirms the invited address with the
 * emailed code, and their password seals their own key to the family's.
 * Nobody else has to be online.
 */
export function JoinFamily({ invitationId }: { invitationId: string }) {
  const t = useTranslations("join");
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    const secret = inviteSecretFromHash(window.location.hash);
    void Promise.all([loadInvitationPreview(dodi, invitationId), getSessionUser().catch(() => null)]).then(
      ([invitation, user]) => {
        if (!isCurrent) return;
        if (!invitation) return setStage({ kind: "unavailable", messageKey: "joinNotFound" });
        if (invitation.status === "expired") return setStage({ kind: "unavailable", messageKey: "joinExpired" });
        if (invitation.status !== "pending") return setStage({ kind: "unavailable", messageKey: "joinUsed" });
        if (!secret) return setStage({ kind: "unavailable", messageKey: "joinLinkIncomplete" });
        setStage({ kind: "ready", invitation, secret, signedInEmail: user?.email ?? null });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [invitationId]);

  if (stage.kind === "loading") {
    return <JoinCard title={t("title")} description={t("loading")} />;
  }
  if (stage.kind === "unavailable") {
    return <JoinCard title={t("title")} description={t(stage.messageKey)} />;
  }

  const { invitation, secret, signedInEmail } = stage;
  const props = { invitation, secret };
  const intro = t("intro", {
    inviter: invitation.inviterEmail ?? t("someone"),
    role: t(invitation.role === "co_parent" ? "roleCoParent" : "roleMember"),
  });

  if (signedInEmail) {
    return signedInEmail.toLowerCase() === invitation.invitedEmail ? (
      <JoinConfirmPassword {...props} intro={intro} />
    ) : (
      <WrongLogin signedInEmail={signedInEmail} invitedEmail={invitation.invitedEmail} />
    );
  }
  return hasAccount ? (
    <JoinSignIn {...props} intro={intro} onCreateAccount={() => setHasAccount(false)} />
  ) : (
    <JoinNewLogin {...props} intro={intro} onHaveAccount={() => setHasAccount(true)} />
  );
}

function JoinCard({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

/** Signed in with another address: the invitation is not for this login. */
function WrongLogin({ signedInEmail, invitedEmail }: { signedInEmail: string; invitedEmail: string }) {
  const t = useTranslations("join");
  const router = useRouter();
  return (
    <JoinCard title={t("title")} description={t("wrongLogin", { signedIn: signedInEmail, invited: invitedEmail })}>
      <Button
        className="min-h-11 w-full"
        onClick={async () => {
          await endSession();
          router.refresh();
          window.location.reload();
        }}
      >
        {t("signOutToJoin")}
      </Button>
    </JoinCard>
  );
}
