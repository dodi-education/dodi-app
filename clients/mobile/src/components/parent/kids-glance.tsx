import { type Href, Link } from "expo-router";
import { Pressable, View } from "react-native";
import { kidRowLink } from "@dodi/ui-recipes";
import { useTranslations } from "use-intl";
import { kidGlanceItems } from "@dodi/client-state/dashboard";
import { ageFromBirthdate } from "@dodi/intl/age";

import { KidAvatar } from "@/components/kids/kid-avatar";
import { KidRowActions } from "@/components/kids/kid-row-actions";
import { DotSep, Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Badge, Text } from "@/components/ui";
import { useKidStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";

/**
 * The dashboard's "Kids at a glance" (web: parent/kids-glance), from the
 * decrypted kid list: each row opens the kid, with Edit / Memory beside it.
 */
export function KidsGlance() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const kids = useKidStore((s) => s.list);

  if (kids && kids.length === 0) return null;

  return (
    <Section title={t("kidsGlance")}>
      {!kids ? (
        <View className="px-5 py-6">
          <Text className="text-center text-sm text-muted-foreground">{tc("loading")}</Text>
        </View>
      ) : (
        kidGlanceItems(kids).map((kid) => {
          const age = ageFromBirthdate(kid.birthdate);
          return (
            <Row key={kid.id}>
              <Link href={`/parent/kids/${kid.id}` as Href} asChild>
                <Pressable accessibilityRole="link" className={cn(kidRowLink.box, "active:opacity-80")}>
                  <KidAvatar initial={kid.initial} colorIndex={kid.colorIndex} />
                  <RowMain>
                    <RowTitle>
                      <RowTitleText>{kid.name}</RowTitleText>
                      {age !== null ? <Badge variant="gray">{t("ageYears", { age })}</Badge> : null}
                    </RowTitle>
                    <RowMeta>
                      {kid.languageLabel}
                      {/* Embedded in the kid row (decrypted in decryptKid). */}
                      {kid.personaName ? (
                        <>
                          <DotSep />
                          {kid.personaName}
                        </>
                      ) : null}
                    </RowMeta>
                  </RowMain>
                </Pressable>
              </Link>
              <KidRowActions kidId={kid.id} />
            </Row>
          );
        })
      )}
    </Section>
  );
}
