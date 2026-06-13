"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { usePersonas } from "@/hooks/use-personas";
import { useProfiles } from "@/hooks/use-profiles";

const AVATAR_PALETTE = [
  { bg: "bg-primary-soft-2", fg: "text-primary" },
  { bg: "bg-success-soft", fg: "text-success" },
  { bg: "bg-[#EFE9FA]", fg: "text-[#7456C4]" },
  { bg: "bg-[#FDF1DC]", fg: "text-[#B0782A]" },
];

function avatarColor(index: number) {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Client island: the dashboard "profiles at a glance" list (decrypted). */
export function ProfilesGlance() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { profiles } = useProfiles();
  const { nameById: personaNames } = usePersonas();

  if (profiles && profiles.length === 0) return null;

  return (
    <Section title={t("profilesGlance")}>
      {!profiles ? (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          {tc("loading")}
        </div>
      ) : (
        profiles.map((profile, i) => {
          const color = avatarColor(i);
          const age = ageFromBirthdate(profile.birthdate);
          const personaName = profile.active_persona_id
            ? personaNames.get(profile.active_persona_id)
            : null;
          return (
            <Link
              key={profile.id}
              href={`/profiles/${profile.id}`}
              className="block"
            >
              <Row clickable>
                <div
                  className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${color.bg} ${color.fg}`}
                >
                  {profile.display_name[0]?.toUpperCase()}
                </div>
                <RowMain>
                  <RowTitle>
                    {profile.display_name}
                    {age !== null ? (
                      <Badge variant="gray">{t("ageYears", { age })}</Badge>
                    ) : null}
                  </RowTitle>
                  <RowMeta>
                    {profile.language.toUpperCase()}
                    {personaName ? (
                      <>
                        <DotSep />
                        {personaName}
                      </>
                    ) : null}
                  </RowMeta>
                </RowMain>
                <Icon name="chevron_right" size={16} className="text-faint" />
              </Row>
            </Link>
          );
        })
      )}
    </Section>
  );
}
