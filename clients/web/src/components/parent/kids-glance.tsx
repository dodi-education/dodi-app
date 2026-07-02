"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { KidRowActions } from "@/components/parent/kid-row-actions";
import { Section } from "@/components/parent/section";
import { Badge } from "@/components/ui/badge";
import { usePersonas } from "@/hooks/use-personas";
import { useKids } from "@/hooks/use-kids";
import { ageFromBirthdate } from "@dodi/intl";

const AVATAR_PALETTE = [
  { bg: "bg-primary-soft-2", fg: "text-primary" },
  { bg: "bg-success-soft", fg: "text-success" },
  { bg: "bg-[#EFE9FA]", fg: "text-[#7456C4]" },
  { bg: "bg-[#FDF1DC]", fg: "text-[#B0782A]" },
];

function avatarColor(index: number) {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

/** Client island: the dashboard "kids at a glance" list (decrypted). */
export function KidsGlance() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { kids } = useKids();
  const { nameById: personaNames } = usePersonas();

  if (kids && kids.length === 0) return null;

  return (
    <Section title={t("kidsGlance")}>
      {!kids ? (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          {tc("loading")}
        </div>
      ) : (
        kids.map((kid, i) => {
          const color = avatarColor(i);
          const age = ageFromBirthdate(kid.birthdate);
          const personaName = kid.active_persona_id
            ? personaNames.get(kid.active_persona_id)
            : null;
          return (
            <Row key={kid.id} clickable>
              <Link
                href={`/parent/kids/${kid.id}`}
                className="flex min-w-0 flex-1 items-center gap-3.5"
              >
                <div
                  className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${color.bg} ${color.fg}`}
                >
                  {kid.display_name[0]?.toUpperCase()}
                </div>
                <RowMain>
                  <RowTitle>
                    {kid.display_name}
                    {age !== null ? (
                      <Badge variant="gray">{t("ageYears", { age })}</Badge>
                    ) : null}
                  </RowTitle>
                  <RowMeta>
                    {kid.language.toUpperCase()}
                    {personaName ? (
                      <>
                        <DotSep />
                        {personaName}
                      </>
                    ) : null}
                  </RowMeta>
                </RowMain>
              </Link>
              <KidRowActions kidId={kid.id} />
            </Row>
          );
        })
      )}
    </Section>
  );
}
