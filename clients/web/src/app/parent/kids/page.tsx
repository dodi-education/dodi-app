"use client";

import {
  kidAvatar,
  kidAvatarPalette,
  kidRowLink,
  sectionEmpty,
  sectionMessage,
} from "@dodi/ui-recipes";
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
import { useKids } from "@/hooks/use-kids";
import { cn } from "@/lib/utils";
import { ageFromBirthdate } from "@dodi/intl";

/** Shared with the app (@dodi/ui-recipes). */
const AVATAR_PALETTE = kidAvatarPalette;

function avatarColor(index: number) {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

export default function KidsPage() {
  const t = useTranslations("kids");
  const td = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { formatDateOnly } = useDateFormat();
  const { kids, loading, error } = useKids();

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
          <div className={cn(sectionMessage.box, sectionMessage.text)}>
            {tc("loading")}
          </div>
        </Section>
      ) : error ? (
        <Section title={t("yourKids")}>
          <div
            className={cn(
              sectionMessage.box,
              sectionMessage.text,
              sectionMessage.danger,
            )}
          >
            {error}
          </div>
        </Section>
      ) : !kids || kids.length === 0 ? (
        <Section title={t("yourKids")}>
          <div className={cn(sectionEmpty.web, sectionEmpty.box)}>
            <Icon name="kids" className={sectionEmpty.webIcon} />
            <p className={sectionEmpty.text}>{t("noKids")}</p>
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
                      {kid.active_persona?.name ?? t("default")}
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
