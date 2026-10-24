import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import type { InvitationPreview } from "@dodi/client-state/family-members";

import { AuthLayout } from "@/components/shared/auth-layout";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Text } from "@/components/ui";

import { useFinishJoin } from "./use-join";

/** Already signed in with the invited address: the password seals the family's key to them (web: join-confirm-password). */
export function JoinConfirmPassword({
  invitation,
  secret,
  intro,
}: {
  invitation: InvitationPreview;
  secret: string;
  intro: string;
}) {
  const t = useTranslations("join");
  const tAuth = useTranslations("auth");
  const finish = useFinishJoin(invitation.id, secret);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setIsJoining(true);
    setError(await finish(password));
    setIsJoining(false);
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{intro}</CardDescription>
        </CardHeader>
        <CardContent>
          <View className="flex flex-col gap-4">
            <Text className="text-sm text-muted-foreground">{t("confirmPasswordHint")}</Text>
            <View className="flex flex-col gap-2">
              <Label>{tAuth("password")}</Label>
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel={tAuth("password")}
                autoFocus
                onSubmitEditing={() => void submit()}
              />
            </View>
            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {error}
              </Text>
            ) : null}
            <Button className="w-full" disabled={isJoining || !password} onPress={() => void submit()}>
              {isJoining ? t("joining") : t("join")}
            </Button>
          </View>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
