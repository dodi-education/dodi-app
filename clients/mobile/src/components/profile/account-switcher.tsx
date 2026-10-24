import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  ownsAnAccount,
  startOwnFamily,
  switchFamily,
  type LoginFamily,
} from "@dodi/client-state/family-members";

import { api } from "@/adapters/platform";
import { FormAlert } from "@/components/games-library/form-alert";
import { FieldRow } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button, Select, Text } from "@/components/ui";
import { clientState } from "@/lib/client-state";

const ROLE_KEYS = { owner: "roleOwner", co_parent: "roleCoParent", member: "roleMember" } as const;

/**
 * Profile > Your accounts (web: components/parent/profile/account-switcher):
 * which account this profile is using, switching between them, and creating
 * one of its own. Switching drops this device's view of the old account; the
 * vault gate then opens the other one.
 */
export function AccountSwitcher({ families }: { families: LoginFamily[] }) {
  const t = useTranslations("profile");
  const ta = useTranslations("access");
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deps = { api, vault: clientState.vault, dropFamilyData: clientState.dropFamilyData };

  async function run(action: () => Promise<boolean>): Promise<void> {
    setIsBusy(true);
    setError(null);
    if (await action()) {
      // Every screen starts over in the other account.
      router.replace("/parent/dashboard");
      return;
    }
    setError(t("switchFailed"));
    setIsBusy(false);
  }

  if (families.length === 0) return null;
  const active = families.find((family) => family.isActive) ?? families[0];
  const label = (family: LoginFamily) =>
    t("accountRole", {
      account:
        family.role === "owner" ? t("accountYours") : t("accountOf", { email: family.ownerEmail ?? "" }),
      role: ta(ROLE_KEYS[family.role]),
    });

  return (
    <Section title={t("accountsTitle")} desc={t("accountsDesc")}>
      <FieldRow label={t("accountsCurrent")}>
        {families.length > 1 ? (
          <Select
            label={t("accountsCurrent")}
            value={active.accountId}
            options={families.map((family) => ({ value: family.accountId, label: label(family) }))}
            onValueChange={(value) => {
              if (!isBusy && value !== active.accountId) void run(() => switchFamily(deps, value));
            }}
          />
        ) : (
          <Text className="text-sm text-ink-2">{label(active)}</Text>
        )}
      </FieldRow>
      {ownsAnAccount(families) ? null : (
        <FieldRow label={t("startOwn")} hint={t("startOwnHint")}>
          <Button
            variant="outline"
            disabled={isBusy}
            onPress={() => void run(async () => (await startOwnFamily(deps)).kind === "started")}
          >
            {t("startOwnButton")}
          </Button>
        </FieldRow>
      )}
      {error ? (
        <View className="px-5 pb-4">
          <FormAlert>{error}</FormAlert>
        </View>
      ) : null}
    </Section>
  );
}
