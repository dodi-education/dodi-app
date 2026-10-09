import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { activeCompanionOf, companionNameOf, MAX_COMPANIONS_PER_KID } from "@dodi/client-state/companions";
import { personaAvatar } from "@dodi/ui-recipes";

import { Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { PersonaList } from "@/components/personas/persona-list";
import { CharacterAssetList } from "@/components/parent/character-asset-list";
import { ShellContent } from "@/components/shared/shell-content";
import { Badge, Button, Icon, TabsLabel, TabsList, TabsTrigger } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { useKids } from "@/lib/use-kids";

type Tab = "companions" | "personas";

/** Each kid's companions, with the active one marked (web: the Companions tab). */
function CompanionsTab() {
  const t = useTranslations("companions");
  const tp = useTranslations("personas");
  const router = useRouter();
  const { kids } = useKids();

  if (!kids) return null;
  if (kids.length === 0) {
    return (
      <Section>
        <Row>
          <RowMain>
            <RowMeta>{t("noKids")}</RowMeta>
          </RowMain>
        </Row>
      </Section>
    );
  }

  return (
    <View>
      {kids.map((kid) => {
        const active = activeCompanionOf(kid);
        const isFull = kid.companions.length >= MAX_COMPANIONS_PER_KID;
        return (
          <Section
            key={kid.id}
            title={t("kidCompanions", { name: kid.display_name })}
            action={
              <Button
                variant="outline"
                size="sm"
                icon="add"
                disabled={isFull}
                onPress={() => router.push(`/parent/companions/new?kid=${kid.id}` as Href)}
              >
                {t("addCompanion")}
              </Button>
            }
          >
            {kid.companions.map((companion) => (
              <Row
                key={companion.id}
                accessibilityLabel={companionNameOf(companion)}
                onPress={() => router.push(`/parent/companions/${companion.id}` as Href)}
              >
                <View className={personaAvatar.box}>
                  <Icon name="personas" size={16} color="primary" />
                </View>
                <RowMain>
                  <RowTitle>
                    <RowTitleText>{companionNameOf(companion)}</RowTitleText>
                    {companion.id === active?.id ? <Badge variant="blue">{t("active")}</Badge> : null}
                  </RowTitle>
                  <RowMeta numberOfLines={1}>
                    {t("personaLine", { persona: companion.persona?.name ?? tp("useDefault") })}
                  </RowMeta>
                </RowMain>
                <Icon name="chevron_right" size={16} color="faint" />
              </Row>
            ))}
          </Section>
        );
      })}
      <CharacterAssetList />
    </View>
  );
}

/**
 * Parent > Companions (web: parent/companions/page): the kids' companions and,
 * under `?tab=personas`, the account's personas.
 */
export default function CompanionsScreen() {
  const t = useTranslations("companions");
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: Tab = params.tab === "personas" ? "personas" : "companions";

  return (
    <ShellContent onRefresh={() => clientState.kids.getState().loadList(true)}>
      <TabsList>
        <TabsTrigger
          isActive={tab === "companions"}
          onPress={() => router.replace("/parent/companions" as Href)}
        >
          <Icon name="personas" size={16} color={tab === "companions" ? "primary" : "muted-foreground"} />
          <TabsLabel isActive={tab === "companions"}>{t("tabCompanions")}</TabsLabel>
        </TabsTrigger>
        <TabsTrigger
          isActive={tab === "personas"}
          onPress={() => router.replace("/parent/companions?tab=personas" as Href)}
        >
          <Icon name="sparkles" size={16} color={tab === "personas" ? "primary" : "muted-foreground"} />
          <TabsLabel isActive={tab === "personas"}>{t("tabPersonas")}</TabsLabel>
        </TabsTrigger>
      </TabsList>
      {tab === "personas" ? <PersonaList /> : <CompanionsTab />}
    </ShellContent>
  );
}
