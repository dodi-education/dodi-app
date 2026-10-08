"use client";

import { useTranslations } from "next-intl";

import { companionNameOf, setActiveCompanion } from "@dodi/client-state/companions";
import { playground as p } from "@dodi/ui-recipes";

import { useActiveCompanion } from "@/hooks/use-active-companion";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { cn } from "@/lib/utils";

/** The kid's companions, to switch between (shown when there is more than one). */
export function CompanionSwitcher() {
  const t = useTranslations("playground");
  const { kid, companion } = useActiveCompanion();
  if (!kid || kid.companions.length < 2) return null;
  return (
    <div className={cn(p.section, p.webSection)} role="radiogroup" aria-label={t("switchCompanion")}>
      <span className={p.label}>{t("switchCompanion")}</span>
      <div className={cn(p.row, p.webRow)}>
        {kid.companions.map((c) => {
          const isActive = c.id === companion?.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={cn(p.chip, p.webChip, isActive && p.chipSelected)}
              onClick={() => {
                if (!isActive) void setActiveCompanion(companionFlowDeps(), kid.id, c.id).catch(() => {});
              }}
            >
              <span className={p.chipText}>{companionNameOf(c)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
