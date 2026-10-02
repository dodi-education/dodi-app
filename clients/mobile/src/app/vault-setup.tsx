import * as Clipboard from "expo-clipboard";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";

import { CenteredPage } from "@/components/auth/centered-page";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Text,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { useVaultStore } from "@/lib/client-state";

// The key's font tracks the box width (web: clamp(0.65rem, 2.5cqi, 0.875rem)).
const KEY_FONT_MIN = 10.4;
const KEY_FONT_MAX = 14;
const KEY_FONT_PER_WIDTH = 0.025;

/**
 * Shown once after the vault is created: the nsec account key, the only way
 * back in after a forgotten password on a lost device (web: vault-setup).
 */
export default function VaultSetupScreen() {
  const t = useTranslations("vault");
  const router = useRouter();
  const nsec = useVaultStore((s) => s.pendingNsec);
  const acknowledge = useVaultStore((s) => s.acknowledgeNsec);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [keyFontSize, setKeyFontSize] = useState(KEY_FONT_MIN);
  const [hasContinued, setHasContinued] = useState(false);

  // Landed here with nothing to show (e.g. a relaunch after setup): leave.
  if (!nsec) return hasContinued ? null : <Redirect href="/parent/dashboard" />;

  async function copyKey(): Promise<void> {
    if (!nsec) return;
    await Clipboard.setStringAsync(nsec);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  function finish(): void {
    setHasContinued(true);
    acknowledge();
    // Onboarding continues with the account preferences step.
    router.replace("/onboarding");
  }

  return (
    <CenteredPage className="max-w-2xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("saveKeyTitle")}</CardTitle>
          <CardDescription>{t("saveKeyDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* One unbroken token: never wrapped. It sits on a single line down to
              a readable floor, below which the box scrolls. */}
          <View
            className="overflow-hidden rounded-lg border border-border bg-muted/40"
            onLayout={(e) => {
              const width = e.nativeEvent.layout.width;
              setKeyFontSize(Math.min(KEY_FONT_MAX, Math.max(KEY_FONT_MIN, width * KEY_FONT_PER_WIDTH)));
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="min-w-full justify-center px-4 py-3.5"
            >
              <Text
                selectable
                numberOfLines={1}
                className="text-center font-mono leading-relaxed"
                style={{ fontSize: keyFontSize, lineHeight: keyFontSize * 1.625 }}
                accessibilityLabel={t("saveKeyTitle")}
              >
                {nsec}
              </Text>
            </ScrollView>
          </View>
          <Button variant="outline" onPress={() => void copyKey()}>
            {isCopied ? t("keyCopied") : t("copyKey")}
          </Button>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSaved }}
            onPress={() => setIsSaved((v) => !v)}
            hitSlop={12}
            className="flex-row items-start gap-2"
          >
            <View
              className={cn(
                "mt-0.5 size-4 shrink-0 items-center justify-center rounded-[4px] border",
                isSaved ? "border-primary bg-primary" : "border-border-strong bg-card",
              )}
            >
              {isSaved ? <Icon name="check" size={12} stroke={3} color="primary-foreground" /> : null}
            </View>
            <Text className="flex-1 text-sm">{t("savedItConfirm")}</Text>
          </Pressable>
          <Button onPress={finish} disabled={!isSaved} className="w-full">
            {t("continue")}
          </Button>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
