import { type Href, Link, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { kidInitial } from "@dodi/client-state/kid-profile";
import { ageFromBirthdate } from "@dodi/intl/age";
import { kidRowLink, sectionEmpty, sectionMessage } from "@dodi/ui-recipes";

import { FriendApprovals } from "@/components/kids/friend-approvals";
import { KidAvatar } from "@/components/kids/kid-avatar";
import { KidRowActions } from "@/components/kids/kid-row-actions";
import { DotSep, Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { PageActions, Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Badge, Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";
import { useKids } from "@/lib/use-kids";

/**
 * The kids list (web: parent/kids/page), as it renders on a phone: pending
 * friend approvals, then each kid with its friend code, persona and birthdate,
 * and the Edit / Memory quick actions.
 */
export default function KidsScreen() {
  const t = useTranslations("kids");
  const td = useTranslations("dashboard");
  const tc = useTranslations("common");
  const router = useRouter();
  const { formatDateOnly } = useAccountDateFormat();
  const { kids, loading, error } = useKids();

  const addKid = (): void => router.push("/parent/kids/new" as Href);

  return (
    <ShellContent>
      <PageActions>
        <Button onPress={addKid}>{t("addKid")}</Button>
      </PageActions>

      <FriendApprovals />

      {loading ? (
        <Section title={t("yourKids")}>
          <View className={sectionMessage.box}>
            <Text className={sectionMessage.text}>{tc("loading")}</Text>
          </View>
        </Section>
      ) : error ? (
        <Section title={t("yourKids")}>
          <View className={sectionMessage.box}>
            <Text className={cn(sectionMessage.text, sectionMessage.danger)}>{error}</Text>
          </View>
        </Section>
      ) : !kids || kids.length === 0 ? (
        <Section title={t("yourKids")}>
          <View className={sectionEmpty.box}>
            <Icon name="kids" size={sectionEmpty.icon.size} color={sectionEmpty.icon.color} />
            <Text className={sectionEmpty.text}>{t("noKids")}</Text>
            <Button onPress={addKid}>{t("addKid")}</Button>
          </View>
        </Section>
      ) : (
        <Section title={t("yourKids")}>
          {kids.map((kid, i) => {
            const age = ageFromBirthdate(kid.birthdate);
            return (
              <Row key={kid.id}>
                <Link href={`/parent/kids/${kid.id}` as Href} asChild>
                  <Pressable
                    accessibilityRole="link"
                    className={cn(kidRowLink.box, "active:opacity-80")}
                  >
                    <KidAvatar initial={kidInitial(kid.display_name)} colorIndex={i} />
                    <RowMain>
                      <RowTitle>
                        <RowTitleText>{kid.display_name}</RowTitleText>
                        {age !== null ? <Badge variant="gray">{td("ageYears", { age })}</Badge> : null}
                      </RowTitle>
                      <RowMeta>
                        {kid.social_id}
                        <DotSep />
                        {kid.active_persona?.name ?? t("default")}
                        <DotSep />
                        {kid.birthdate
                          ? t("born", { date: formatDateOnly(kid.birthdate) ?? kid.birthdate })
                          : t("birthdateNotSet")}
                      </RowMeta>
                    </RowMain>
                  </Pressable>
                </Link>
                <KidRowActions kidId={kid.id} />
              </Row>
            );
          })}
        </Section>
      )}
    </ShellContent>
  );
}
