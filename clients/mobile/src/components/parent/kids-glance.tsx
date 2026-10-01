import { View } from "react-native";
import { useTranslations } from "use-intl";
import { kidGlanceItems } from "@dodi/client-state/dashboard";
import { ageFromBirthdate } from "@dodi/intl/age";
import type { Kid } from "@dodi/types/database";

import { Card, Text } from "@/components/ui";

const AVATAR_PALETTE = [
  { bg: "bg-primary-soft-2", fg: "text-primary" },
  { bg: "bg-success-soft", fg: "text-success" },
  { bg: "bg-warning-soft", fg: "text-warning" },
  { bg: "bg-muted", fg: "text-ink-2" },
] as const;

/**
 * "Kids at a glance" (web: parent/kids-glance), from the decrypted kid list.
 * Rows don't open the kid yet: the kid pages arrive in a later phase.
 */
export function KidsGlance({ kids }: { kids: readonly Kid[] }) {
  const t = useTranslations("dashboard");
  if (kids.length === 0) return null;

  return (
    <Card title={t("kidsGlance")}>
      {kidGlanceItems(kids).map((kid, index) => {
        const color = AVATAR_PALETTE[kid.colorIndex % AVATAR_PALETTE.length];
        const age = ageFromBirthdate(kid.birthdate);
        return (
          <View
            key={kid.id}
            className={
              index > 0
                ? "min-h-12 flex-row items-center gap-3 border-t border-border pt-3"
                : "min-h-12 flex-row items-center gap-3"
            }
          >
            <View className={`h-9 w-9 items-center justify-center rounded-full ${color.bg}`}>
              <Text className={`text-sm font-bold ${color.fg}`}>{kid.initial}</Text>
            </View>
            <View className="flex-1 gap-0.5">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="font-semibold">{kid.name}</Text>
                {age !== null ? (
                  <View className="rounded-md bg-muted px-1.5 py-0.5">
                    <Text variant="muted" className="text-xs">
                      {t("ageYears", { age })}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="muted" className="text-xs">
                {kid.personaName ? `${kid.languageLabel} · ${kid.personaName}` : kid.languageLabel}
              </Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}
