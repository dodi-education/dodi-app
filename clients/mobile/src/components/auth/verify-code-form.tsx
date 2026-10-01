import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { RESEND_COOLDOWN_SECONDS } from "@dodi/client-state";

import { Button, Notice, Text, TextField } from "@/components/ui";

const CODE_LENGTH = 6;

/**
 * The emailed 6-digit code step (sign-in of an unconfirmed account, and
 * registration). Callers resolve with an error message to show, or null.
 */
export function VerifyCodeForm({
  description,
  onVerify,
  onResend,
  onBack,
  children,
}: {
  description: string;
  onVerify: (code: string) => Promise<string | null>;
  onResend: () => Promise<string | null>;
  onBack: () => void;
  /** The caller's captcha widget, so a resend can fetch a token. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("auth");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verify(): Promise<void> {
    if (code.length < CODE_LENGTH || isVerifying) return;
    setIsVerifying(true);
    setError(null);
    const message = await onVerify(code);
    if (message !== null) {
      setError(message);
      setCode("");
      setIsVerifying(false);
    }
  }

  async function resend(): Promise<void> {
    setError(null);
    setInfo(null);
    const message = await onResend();
    if (message !== null) {
      setError(message);
      return;
    }
    setInfo(t("codeResent"));
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <View className="gap-4">
      <Text variant="title">{t("enterCodeTitle")}</Text>
      <Text variant="muted">{description}</Text>
      <TextField
        label={t("codeLabel")}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        onSubmitEditing={() => void verify()}
        className="tracking-[0.5em]"
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {info ? <Notice tone="success">{info}</Notice> : null}
      {children}
      <Button
        label={isVerifying ? t("verifyingCode") : t("verifyButton")}
        isLoading={isVerifying}
        disabled={code.length < CODE_LENGTH}
        onPress={() => void verify()}
      />
      <Button
        variant="ghost"
        label={cooldown > 0 ? t("resendCodeIn", { seconds: cooldown }) : t("resendCode")}
        disabled={cooldown > 0}
        onPress={() => void resend()}
      />
      <Button variant="ghost" label={t("backToDifferentEmail")} onPress={onBack} />
    </View>
  );
}
