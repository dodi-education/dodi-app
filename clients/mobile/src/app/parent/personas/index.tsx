import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { loadPersonas, personaSummary } from "@dodi/client-state/personas";
import type { Persona } from "@dodi/types/database";
import { personaAvatar } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { PageActions, Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Badge, Button, Icon } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";

/**
 * The personas list (web: parent/personas/page): the built-in default and the
 * account's own personas (names and souls decrypted on the device).
 */
export default function PersonasScreen() {
  const t = useTranslations("personas");
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    if (!session) return;
    let isCancelled = false;
    // Account personas arrive as ciphertext; decrypted for display ([] on failure).
    void loadPersonas(api, session).then((list) => {
      if (!isCancelled) setPersonas(list);
    });
    return () => {
      isCancelled = true;
    };
  }, [session]);

  return (
    <ShellContent>
      <PageActions>
        <Button variant="outline" onPress={() => router.push("/parent/personas/new?import=true" as Href)}>
          {t("import")}
        </Button>
        <Button icon="add" onPress={() => router.push("/parent/personas/new" as Href)}>
          {t("createPersona")}
        </Button>
      </PageActions>

      <Section title={t("yourPersonas")}>
        {personas.map((persona) => (
          <Row
            key={persona.id}
            accessibilityLabel={persona.name}
            onPress={() => router.push(`/parent/personas/${persona.id}` as Href)}
          >
            <View className={personaAvatar.box}>
              <Icon name="sparkles" size={16} color="primary" />
            </View>
            <RowMain>
              <RowTitle>
                <RowTitleText>{persona.name}</RowTitleText>
                {persona.is_system_default ? (
                  <Badge variant="blue">{t("default")}</Badge>
                ) : (
                  <Badge variant="gray">{t("custom")}</Badge>
                )}
              </RowTitle>
              <RowMeta numberOfLines={1}>{personaSummary(persona.soul) ?? t("noDescription")}</RowMeta>
            </RowMain>
            <Icon name="chevron_right" size={16} color="faint" />
          </Row>
        ))}
      </Section>
    </ShellContent>
  );
}
