/**
 * Change the password (web: parent/change-password): the auth password, then
 * the vault re-wrapped under it. The open vault proves access, so no old
 * password is asked.
 */
import { useState } from "react";
import { useTranslations } from "use-intl";
import { changePassword } from "@dodi/client-state/change-password";

import { mobileAuthApi } from "@/adapters/auth";
import { Button, Card, Notice, TextField } from "@/components/ui";
import { clientState } from "@/lib/client-state";

export function ChangePassword() {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  function edit(setter: (value: string) => void) {
    return (value: string) => {
      setError(null);
      setIsDone(false);
      setter(value);
    };
  }

  async function submit(): Promise<void> {
    setError(null);
    setIsDone(false);
    setIsBusy(true);
    const outcome = await changePassword(
      { auth: mobileAuthApi, vault: clientState.vault },
      { password, confirm },
    );
    if (outcome.kind === "done") {
      setIsDone(true);
      setPassword("");
      setConfirm("");
    } else {
      setError(outcome.key ? t(outcome.key) : (outcome.message ?? t("changePasswordFailed")));
    }
    setIsBusy(false);
  }

  const secure = { showLabel: ta("showPassword"), hideLabel: ta("hidePassword") };
  return (
    <Card title={t("changePasswordTitle")} description={t("changePasswordDescription")}>
      <TextField
        label={t("newPassword")}
        value={password}
        onChangeText={edit(setPassword)}
        autoComplete="new-password"
        textContentType="newPassword"
        secure={secure}
      />
      <TextField
        label={t("confirmNewPassword")}
        value={confirm}
        onChangeText={edit(setConfirm)}
        autoComplete="new-password"
        textContentType="newPassword"
        secure={secure}
        onSubmitEditing={() => void submit()}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {isDone ? <Notice tone="success">{t("passwordChanged")}</Notice> : null}
      <Button
        label={isBusy ? t("updatingPassword") : t("updatePassword")}
        isLoading={isBusy}
        disabled={!password || !confirm}
        onPress={() => void submit()}
      />
    </Card>
  );
}
