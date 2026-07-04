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
import { decryptPersona } from "@dodi/vault";
import { useVaultStore } from "@/stores/vault-store";
import type { Persona } from "@dodi/types/database";

export default function PersonasPage() {
  const t = useTranslations("personas");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const session = useVaultStore((s) => s.session);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    dodi
      .request("/api/personas")
      .then((r) => (r.ok ? r.json() : []))
      // Account personas arrive as ciphertext; decrypt name + soul for display.
      .then((d: Persona[]) => {
        if (!cancelled) setPersonas(d.map((p) => decryptPersona(session, p)));
      })
      .catch(() => {
        if (!cancelled) setPersonas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div>
      <PageActions>
        <Button asChild variant="outline">
          <Link href="/parent/personas/new?import=true">{t("import")}</Link>
        </Button>
        <Button asChild>
          <Link href="/parent/personas/new">
            <Icon name="add" size={16} />
            {t("createPersona")}
          </Link>
        </Button>
      </PageActions>

      <Section title={t("yourPersonas")}>
        {personas.map((persona) => (
          <Link
            key={persona.id}
            href={`/parent/personas/${persona.id}`}
            className="block"
          >
            <Row clickable>
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
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
                  {persona.soul
                    .split("\n")
                    .find((l) => l.startsWith("- "))
                    ?.replace(/^- /, "")
                    .replace(/\*\*/g, "") ?? t("noDescription")}
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
