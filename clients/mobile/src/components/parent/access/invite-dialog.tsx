import { useState } from "react";
import { ScrollView, Share, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
import { createFamilyInvite, type InvitableRole } from "@dodi/client-state/family-members";
import type { AgentScope } from "@dodi/protocol/agent-scopes";
import { access } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Button, Dialog, Icon, Input, Label, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { clientState } from "@/lib/client-state";
import { useAccountDateFormat } from "@/lib/date-format";
import { APP_URL } from "@/lib/env";

import { CopyButton } from "./copy-button";
import { MemberAccessFields } from "./member-access-fields";

/**
 * Invite another adult (web: access/invite-dialog). This phone seals the
 * family's key for a one-time link and shows it: the parent sends it
 * themselves through the share sheet (mail, any chat) or copies it. dodi
 * never sends it, so dodi never sees the secret.
 */
export function InviteDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("access");
  const tc = useTranslations("common");
  const { height } = useWindowDimensions();
  const { formatDate } = useAccountDateFormat();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("co_parent");
  const [scopes, setScopes] = useState<AgentScope[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ link: string; expiresAt: string } | null>(null);

  function close(): void {
    if (isCreating) return;
    setEmail("");
    setRole("co_parent");
    setScopes([]);
    setError(null);
    setInvite(null);
    onClose();
  }

  async function create(): Promise<void> {
    setError(null);
    setIsCreating(true);
    const outcome = await createFamilyInvite(
      { api, vault: clientState.vault },
      { email, role, scopes, appUrl: APP_URL },
    );
    setIsCreating(false);
    if (outcome.kind === "error") {
      setError(t(outcome.key));
      return;
    }
    setInvite({ link: outcome.link, expiresAt: outcome.expiresAt });
    onCreated();
  }

  async function send(): Promise<void> {
    if (!invite) return;
    try {
      await Share.share({
        title: t("inviteMailSubject"),
        message: t("inviteMailBody", { link: invite.link, date: formatDate(invite.expiresAt) }),
      });
    } catch {
      /* share sheet unavailable: the link can still be copied */
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      title={t("inviteTitle")}
      description={invite ? t("inviteCreated", { email: email.trim() }) : t("inviteDesc")}
      footer={
        invite ? (
          <Button variant="outline" onPress={close}>
            {t("keyDone")}
          </Button>
        ) : (
          <>
            <Button
              disabled={isCreating || !email.trim() || (role === "member" && scopes.length === 0)}
              onPress={() => void create()}
            >
              {isCreating ? t("inviteCreating") : t("inviteCreate")}
            </Button>
            <Button variant="outline" disabled={isCreating} onPress={close}>
              {tc("cancel")}
            </Button>
          </>
        )
      }
    >
      {invite ? (
        <View className="gap-3">
          <Text selectable className={access.copyText} accessibilityLabel={t("inviteLink")}>
            {invite.link}
          </Text>
          <Button icon="send" onPress={() => void send()}>
            {t("inviteSendEmail")}
          </Button>
          <CopyButton text={invite.link} label={t("inviteLink")} />
          <View accessibilityRole="alert" className="flex-row items-start gap-1.5">
            <Icon name="alert" size={16} color="warning" />
            <Text className={cn("flex-1", access.warning)}>
              {t("inviteLinkWarning", { date: formatDate(invite.expiresAt) })}
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView className="-mx-6" style={{ maxHeight: height * 0.5 }} keyboardShouldPersistTaps="handled">
          <View className={access.block}>
            <Label>{t("inviteEmail")}</Label>
            <Input
              accessibilityLabel={t("inviteEmail")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
          </View>
          <MemberAccessFields role={role} onRoleChange={setRole} scopes={scopes} onScopesChange={setScopes} />
          {error ? (
            <Text className={cn("px-5 pt-3", access.error)} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Dialog>
  );
}
