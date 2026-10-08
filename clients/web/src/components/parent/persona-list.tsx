"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { PageActions, Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dodi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { personaAvatar } from "@dodi/ui-recipes";
import { loadPersonas, personaSummary } from "@dodi/client-state/personas";
import { useVaultStore } from "@/stores/vault-store";
import type { Persona } from "@dodi/types/database";

/** The account's personas (Parent > Companions, Personas tab). */
export function PersonaList() {
  const t = useTranslations("personas");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    // Account personas arrive as ciphertext; decrypted for display ([] on failure).
    void loadPersonas(dodi, session).then((list) => {
      if (!cancelled) setPersonas(list);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div>
      <PageActions>
        <Button asChild variant="outline">
          <Link href="/parent/companions/personas/new?import=true">{t("import")}</Link>
        </Button>
        <Button asChild>
          <Link href="/parent/companions/personas/new">
            <Icon name="add" size={16} />
            {t("createPersona")}
          </Link>
        </Button>
      </PageActions>

      <Section title={t("yourPersonas")}>
        {personas.map((persona) => (
          <Link
            key={persona.id}
            href={`/parent/companions/personas/${persona.id}`}
            className="block"
          >
            <Row clickable>
              <div className={cn(personaAvatar.web, personaAvatar.box)}>
                <Icon name="sparkles" size={16} />
              </div>
              <RowMain>
                <RowTitle>
                  {persona.name}
                  {persona.is_system_default ? (
                    <Badge variant="blue">{t("default")}</Badge>
                  ) : (
                    <Badge variant="gray">{t("custom")}</Badge>
                  )}
                </RowTitle>
                <RowMeta className="truncate">
                  {personaSummary(persona.soul) ?? t("noDescription")}
                </RowMeta>
              </RowMain>
              <Icon name="chevron_right" size={16} className="text-faint" />
            </Row>
          </Link>
        ))}
      </Section>
    </div>
  );
}
