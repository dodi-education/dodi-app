import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { RESEND_COOLDOWN_SECONDS } from "@dodi/client-state";

import { Button, PinInput, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

const CODE_LENGTH = 6;

/**
 * The 6-digit email-code entry (web: components/auth/verify-code-form): owns
 * the code value, the resend cooldown and the inline error/info lines.
 * Callers resolve with an error message to show, or null; on success the
 * caller navigates away, so the form stays busy until it unmounts.
 */
export function VerifyCodeForm({
  description,
  onVerify,
  onResend,
  onBack,
  children,
}: {
  /** Shown above the code entry. Omit when the card header already says it. */
  description?: string;
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

  async function verify(value: string): Promise<void> {
    if (value.length < CODE_LENGTH || isVerifying) return;
    setIsVerifying(true);
    setError(null);
    const message = await onVerify(value);
    if (message !== null) {
      setError(message);
      setCode("");
      setIsVerifying(false);
    }
  }

  async function resend(): Promise<void> {
    if (cooldown > 0) return;
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
    <View className="flex flex-col gap-4">
      {description ? <Text className="text-sm text-muted-foreground">{description}</Text> : null}
      <View className="flex flex-col gap-2">
        <PinInput
          length={CODE_LENGTH}
          value={code}
          onChange={setCode}
          onComplete={(value) => void verify(value)}
          isError={Boolean(error)}
          autoFocus
          accessibilityLabel={t("codeLabel")}
        />
      </View>
      {error ? <Text className="text-center text-sm text-destructive">{error}</Text> : null}
      {info ? <Text className="text-center text-sm text-success">{info}</Text> : null}
      {children}
      <Button
        onPress={() => void verify(code)}
        disabled={isVerifying || code.length < CODE_LENGTH}
        className="w-full"
      >
        {isVerifying ? t("verifyingCode") : t("verifyButton")}
      </Button>
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: cooldown > 0 }}
          onPress={() => void resend()}
          disabled={cooldown > 0}
          hitSlop={12}
        >
          <Text className={cn("text-sm text-muted-foreground", cooldown > 0 && "opacity-50")}>
            {cooldown > 0 ? t("resendCodeIn", { seconds: cooldown }) : t("resendCode")}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={12}>
          <Text className="text-sm text-muted-foreground">{t("backToDifferentEmail")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
