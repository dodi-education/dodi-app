import { View } from "react-native";
import { useTranslations } from "use-intl";
import { access } from "@dodi/ui-recipes";

import { Label, PasswordInput, Text } from "@/components/ui";

interface PasswordConfirmFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Why the password is asked for. */
  hint: string;
}

/**
 * The account password that confirms giving a robot or agent a copy of the
 * vault key (web: access/password-confirm-field).
 */
export function PasswordConfirmField({ value, onChange, hint }: PasswordConfirmFieldProps) {
  const t = useTranslations("access");
  const ta = useTranslations("auth");
  return (
    <View className="flex-col gap-2">
      <Label>{t("password")}</Label>
      <PasswordInput
        accessibilityLabel={t("password")}
        accessibilityHint={hint}
        autoComplete="current-password"
        textContentType="password"
        value={value}
        onChangeText={onChange}
        showPasswordLabel={ta("showPassword")}
        hidePasswordLabel={ta("hidePassword")}
      />
      <Text className={access.note}>{hint}</Text>
    </View>
  );
}
