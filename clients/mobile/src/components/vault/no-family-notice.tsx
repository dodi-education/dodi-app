import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { startOwnFamily } from "@dodi/client-state/family-members";

import { api } from "@/adapters/platform";
import { DeleteProfileDialog } from "@/components/profile/delete-profile";
import { AuthLayout } from "@/components/shared/auth-layout";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Text } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { signOut } from "@/lib/session";

/**
 * Shown by the VaultGate when the signed-in profile belongs to no account
 * (web: components/vault/no-family-notice): create an account of its own,
 * delete the profile, or sign out. A new account's vault is set up next, like
 * after sign-up.
 */
export function NoFamilyNotice() {
  const t = useTranslations("vault");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  async function start(): Promise<void> {
    setIsStarting(true);
    setError(null);
    const outcome = await startOwnFamily({
      api,
      vault: clientState.vault,
      dropFamilyData: clientState.dropFamilyData,
    });
    if (outcome.kind === "error") {
      setError(t(outcome.key));
      setIsStarting(false);
    }
  }

  async function leave(): Promise<void> {
    await signOut();
    router.replace("/login");
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("noFamilyTitle")}</CardTitle>
          <CardDescription>{t("noFamilyDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <View className="flex flex-col gap-3">
            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {error}
              </Text>
            ) : null}
            <Button className="min-h-11 w-full" disabled={isStarting} onPress={() => void start()}>
              {isStarting ? t("startingFamily") : t("startFamily")}
            </Button>
            <Button variant="outline" className="min-h-11 w-full" onPress={() => void leave()}>
              {tc("signOut")}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11 w-full"
              textClassName="text-danger"
              onPress={() => setIsDeleteOpen(true)}
            >
              {t("deleteProfile")}
            </Button>
          </View>
        </CardContent>
      </Card>
      <DeleteProfileDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} />
    </AuthLayout>
  );
}
