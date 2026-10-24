import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import {
  inviteSecretFromHash,
  loadInvitationPreview,
  type InvitationPreview,
} from "@dodi/client-state/family-members";

import { mobileAuthApi } from "@/adapters/auth";
import { api } from "@/adapters/platform";
import { AuthLayout } from "@/components/shared/auth-layout";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { signOut } from "@/lib/session";

import { JoinConfirmPassword } from "./join-confirm-password";
import { JoinNewLogin } from "./join-new-login";
import { JoinSignIn } from "./join-sign-in";

type Stage =
  | { kind: "loading" }
  | { kind: "unavailable"; messageKey: "joinUsed" | "joinExpired" | "joinNotFound" | "joinLinkIncomplete" }
  | { kind: "ready"; invitation: InvitationPreview; secret: string; signedInEmail: string | null };

/** The fragment of the link that opened the app (`#k=…`); "" when there is none. */
function fragmentOf(url: string | null): string {
  if (!url) return "";
  const at = url.indexOf("#");
  return at < 0 ? "" : url.slice(at);
}

/**
 * Joining a family from an invitation link (web: auth/join/join-family): the
 * invited person creates a login (or signs in with theirs), confirms the
 * invited address with the emailed code, and their password seals their own
 * key to the family's. Nobody else has to be online.
 */
export function JoinFamily({ invitationId }: { invitationId: string }) {
  const t = useTranslations("join");
  // The link that opened (or is opening) the app, fragment included.
  const url = Linking.useURL();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void (async () => {
      const link = url ?? (await Linking.getInitialURL());
      const secret = inviteSecretFromHash(fragmentOf(link));
      const [invitation, user] = await Promise.all([
        loadInvitationPreview(api, invitationId),
        mobileAuthApi.sessionUser().catch(() => null),
      ]);
      if (!isCurrent) return;
      if (!invitation) return setStage({ kind: "unavailable", messageKey: "joinNotFound" });
      if (invitation.status === "expired") return setStage({ kind: "unavailable", messageKey: "joinExpired" });
      if (invitation.status !== "pending") return setStage({ kind: "unavailable", messageKey: "joinUsed" });
      if (!secret) return setStage({ kind: "unavailable", messageKey: "joinLinkIncomplete" });
      setStage({ kind: "ready", invitation, secret, signedInEmail: user?.email ?? null });
    })();
    return () => {
      isCurrent = false;
    };
  }, [invitationId, url]);

  if (stage.kind === "loading") return <JoinCard title={t("title")} description={t("loading")} />;
  if (stage.kind === "unavailable") return <JoinCard title={t("title")} description={t(stage.messageKey)} />;

  const { invitation, secret, signedInEmail } = stage;
  const props = { invitation, secret };
  const intro = t("intro", {
    inviter: invitation.inviterEmail ?? t("someone"),
    role: t(invitation.role === "co_parent" ? "roleCoParent" : "roleMember"),
  });

  if (signedInEmail) {
    if (signedInEmail.toLowerCase() === invitation.invitedEmail) {
      return <JoinConfirmPassword {...props} intro={intro} />;
    }
    return (
      <JoinCard
        title={t("title")}
        description={t("wrongLogin", { signedIn: signedInEmail, invited: invitation.invitedEmail })}
      >
        <Button
          className="w-full"
          onPress={async () => {
            await signOut();
            setStage({ ...stage, signedInEmail: null });
          }}
        >
          {t("signOutToJoin")}
        </Button>
      </JoinCard>
    );
  }
  return hasAccount ? (
    <JoinSignIn {...props} intro={intro} onCreateAccount={() => setHasAccount(false)} />
  ) : (
    <JoinNewLogin {...props} intro={intro} onHaveAccount={() => setHasAccount(true)} />
  );
}

function JoinCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? <CardContent>{children}</CardContent> : null}
      </Card>
    </AuthLayout>
  );
}
