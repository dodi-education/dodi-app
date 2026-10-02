"use client";

import { kidAvatar, kidAvatarPalette, kidRowLink } from "@dodi/ui-recipes";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { KidRowActions } from "@/components/parent/kid-row-actions";
import { Section } from "@/components/parent/section";
import { Badge } from "@/components/ui/badge";
import { useKids } from "@/hooks/use-kids";
import { cn } from "@/lib/utils";
import { kidGlanceItems } from "@dodi/client-state/dashboard";
import { ageFromBirthdate } from "@dodi/intl";

/** Shared with the app (@dodi/ui-recipes). */
const AVATAR_PALETTE = kidAvatarPalette;

function avatarColor(index: number) {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

/** Client island: the dashboard "kids at a glance" list (decrypted). */
export function KidsGlance() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { kids } = useKids();

  if (kids && kids.length === 0) return null;

  return (
    <Section title={t("kidsGlance")}>
      {!kids ? (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          {tc("loading")}
        </div>
      ) : (
        kidGlanceItems(kids).map((kid) => {
          const color = avatarColor(kid.colorIndex);
          const age = ageFromBirthdate(kid.birthdate);
          return (
            <Row key={kid.id} clickable>
              <Link
                href={`/parent/kids/${kid.id}`}
                className={cn(kidRowLink.web, kidRowLink.box)}
              >
                <div
                  className={cn(
                    kidAvatar.web,
                    kidAvatar.box,
                    kidAvatar.text,
                    color.bg,
                    color.fg,
                  )}
                >
                  {kid.initial}
                </div>
                <RowMain>
                  <RowTitle>
                    {kid.name}
                    {age !== null ? (
                      <Badge variant="gray">{t("ageYears", { age })}</Badge>
                    ) : null}
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
              </Link>
              <KidRowActions kidId={kid.id} />
            </Row>
          );
        })
      )}
    </Section>
  );
}
