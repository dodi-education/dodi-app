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
import { KidRowActions } from "@/components/parent/kid-row-actions";
import { PageActions, Section } from "@/components/parent/section";
import { Icon } from "@/components/shared/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDateFormat } from "@/components/providers/date-format-provider";
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

export default function KidsPage() {
  const t = useTranslations("kids");
  const td = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { formatDateOnly } = useDateFormat();
  const { kids, loading, error } = useKids();
  const { nameById: personaNames } = usePersonas();

  return (
    <div>
      <PageActions>
        <Button asChild>
          <Link href="/parent/kids/new">{t("addKid")}</Link>
        </Button>
      </PageActions>

      <FriendApprovals />

      {loading ? (
        <Section title={t("yourKids")}>
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            {tc("loading")}
          </div>
        </Section>
      ) : error ? (
        <Section title={t("yourKids")}>
          <div className="px-5 py-12 text-center text-sm text-danger">
            {error}
          </div>
        </Section>
      ) : !kids || kids.length === 0 ? (
        <Section title={t("yourKids")}>
          <div className="flex flex-col items-center gap-4 px-5 py-12">
            <Icon name="kids" className="h-10 w-10 text-primary" />
            <p className="text-sm text-muted-foreground">{t("noKids")}</p>
            <Button asChild>
              <Link href="/parent/kids/new">{t("addKid")}</Link>
            </Button>
          </div>
        </Section>
      ) : (
        <Section title={t("yourKids")}>
          {kids.map((kid, i) => {
            const color = avatarColor(i);
            const age = ageFromBirthdate(kid.birthdate);
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
                        <Badge variant="gray">{td("ageYears", { age })}</Badge>
                      ) : null}
                    </RowTitle>
                    <RowMeta>
                      {kid.social_id}
                      <DotSep />
                      {kid.active_persona_id
                        ? (personaNames.get(kid.active_persona_id) ??
                          t("default"))
                        : t("default")}
                      <DotSep />
                      {kid.birthdate
                        ? t("born", {
                            date:
                              formatDateOnly(kid.birthdate) ??
                              kid.birthdate,
                          })
                        : t("birthdateNotSet")}
                    </RowMeta>
                  </RowMain>
                </Link>
                <KidRowActions kidId={kid.id} />
              </Row>
            );
          })}
        </Section>
      )}
    </div>
  );
}
