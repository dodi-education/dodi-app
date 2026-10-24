import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { FormAlert } from "@/components/games-library/form-alert";
import { Button, Dialog, Label, PasswordInput, Text } from "@/components/ui";

interface PasswordConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** What happens, one line each. */
  consequences: string[];
  confirmLabel: string;
  busyLabel: string;
  /** Runs the action; resolves to an error line, or null when it went through. */
  onConfirm: (password: string) => Promise<string | null>;
}

/**
 * A destructive step that asks for the password again (web:
 * components/parent/password-confirm-dialog): deleting an account or a
 * profile.
 */
export function PasswordConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  consequences,
  confirmLabel,
  busyLabel,
  onConfirm,
}: PasswordConfirmDialogProps) {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close(): void {
    if (isBusy) return;
    setPassword("");
    setError(null);
    onClose();
  }

  async function confirm(): Promise<void> {
    setError(null);
    setIsBusy(true);
    const failure = await onConfirm(password);
    // On success the caller navigates away; keep the dialog busy until then.
    if (failure === null) return;
    setError(failure);
    setIsBusy(false);
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant="destructive"
            icon="delete"
            isLoading={isBusy}
            disabled={isBusy || !password}
            onPress={() => void confirm()}
          >
            {isBusy ? busyLabel : confirmLabel}
          </Button>
          <Button variant="outline" disabled={isBusy} onPress={close}>
            {tc("cancel")}
          </Button>
        </>
      }
    >
      <View className="flex-col gap-4">
        <View className="flex-col gap-1.5">
          {consequences.map((line) => (
            <View key={line} className="flex-row gap-2">
              <Text className="text-sm text-ink-2">•</Text>
              <Text className="flex-1 text-sm text-ink-2">{line}</Text>
            </View>
          ))}
        </View>
        <View className="flex-col gap-2">
          <Label>{t("deletePasswordLabel")}</Label>
          <PasswordInput
            value={password}
            onChangeText={(next) => {
              setError(null);
              setPassword(next);
            }}
            autoComplete="current-password"
            textContentType="password"
            accessibilityLabel={t("deletePasswordLabel")}
            showPasswordLabel={ta("showPassword")}
            hidePasswordLabel={ta("hidePassword")}
          />
        </View>
        {error ? <FormAlert>{error}</FormAlert> : null}
      </View>
    </Dialog>
  );
}
