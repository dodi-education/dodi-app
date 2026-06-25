"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  DotSep,
  Row,
  RowMain,
  RowMeta,
  RowTitle,
} from "@/components/parent/rows";
import { FriendApprovals } from "@/components/parent/friend-approvals";
import { PageHead, Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default function ProfilesPage() {
  const t = useTranslations("profiles");
  const td = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { profiles, loading, error } = useProfiles();
  const { nameById: personaNames } = usePersonas();

  return (
    <div>
      <PageHead
        title={t("title")}
        sub={t("subtitle")}
        action={
          <Button asChild>
            <Link href="/parent/profiles/new">{t("addProfile")}</Link>
          </Button>
        }
      />

      <FriendApprovals />

      {loading ? (
        <Section>
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            {tc("loading")}
          </div>
        </Section>
      ) : error ? (
        <Section>
          <div className="px-5 py-12 text-center text-sm text-danger">
            {error}
          </div>
        </Section>
      ) : !profiles || profiles.length === 0 ? (
        <Section>
          <div className="flex flex-col items-center gap-4 px-5 py-12">
            <Icon name="profiles" className="h-10 w-10 text-primary" />
            <p className="text-sm text-muted-foreground">{t("noProfiles")}</p>
            <Button asChild>
              <Link href="/parent/profiles/new">{t("createFirstProfile")}</Link>
            </Button>
          </div>
        </Section>
      ) : (
        <Section>
          {profiles.map((profile, i) => {
            const color = avatarColor(i);
            const age = ageFromBirthdate(profile.birthdate);
            return (
              <Link
                key={profile.id}
                href={`/parent/profiles/${profile.id}`}
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
                        <Badge variant="gray">{td("ageYears", { age })}</Badge>
                      ) : null}
                    </RowTitle>
                    <RowMeta>
                      {profile.social_id}
                      <DotSep />
                      {profile.active_persona_id
                        ? (personaNames.get(profile.active_persona_id) ??
                          t("default"))
                        : t("default")}
                      <DotSep />
                      {profile.birthdate
                        ? t("born", { date: profile.birthdate })
                        : t("birthdateNotSet")}
                    </RowMeta>
                  </RowMain>
                  <Icon name="chevron_right" size={16} className="text-faint" />
                </Row>
              </Link>
            );
          })}
        </Section>
      )}
    </div>
  );
}
