"use client";

import { useTranslations } from "next-intl";

import { FieldRow, fieldSelectClass } from "@/components/parent/rows";
import { Icon } from "@/components/shared/icon";
import { Switch } from "@/components/ui/switch";
import { AGENT_EXPIRY_CHOICES, AGENT_SCOPE_LABEL_KEYS } from "@dodi/client-state/authorized-clients";
import { SENSITIVE_AGENT_SCOPES, type AgentScope } from "@dodi/protocol/agent-scopes";

interface AgentGrantFieldsProps {
  /** Distinguishes the ids of several forms on one page. */
  idPrefix: string;
  /** The scopes offered as toggles (an approval only narrows what was requested). */
  scopes: readonly AgentScope[];
  selected: readonly AgentScope[];
  onSelectedChange: (selected: AgentScope[]) => void;
  /** Days; null = never expires. */
  expiresInDays: number | null;
  onExpiresInDaysChange: (days: number | null) => void;
}

/** Scope toggles and the expiry choice, shared by the approval card and the access key form. */
export function AgentGrantFields({
  idPrefix,
  scopes,
  selected,
  onSelectedChange,
  expiresInDays,
  onExpiresInDaysChange,
}: AgentGrantFieldsProps) {
  const t = useTranslations("access");

  function toggle(scope: AgentScope, isOn: boolean) {
    // Keep the canonical order of `scopes`.
    onSelectedChange(scopes.filter((s) => (s === scope ? isOn : selected.includes(s))));
  }

  return (
    <>
      <div className="px-5 pt-4 pb-2 text-sm font-semibold">{t("scopesLabel")}</div>
      {scopes.map((scope) => {
        const keys = AGENT_SCOPE_LABEL_KEYS[scope];
        const isSensitive = SENSITIVE_AGENT_SCOPES.includes(scope);
        const id = `${idPrefix}-scope-${scope.replace(":", "-")}`;
        return (
          <FieldRow
            key={scope}
            label={t(keys.title)}
            htmlFor={id}
            hint={
              <>
                {t(keys.desc)}
                {isSensitive ? (
                  <span role="note" className="mt-1.5 flex items-start gap-1.5 text-warning">
                    <Icon name="alert" size={14} />
                    <span>{t("sensitiveWarning")}</span>
                  </span>
                ) : null}
              </>
            }
          >
            <Switch
              id={id}
              checked={selected.includes(scope)}
              onCheckedChange={(isOn) => toggle(scope, isOn)}
            />
          </FieldRow>
        );
      })}
      <FieldRow label={t("expiry")} htmlFor={`${idPrefix}-expiry`}>
        <select
          id={`${idPrefix}-expiry`}
          className={fieldSelectClass}
          value={expiresInDays === null ? "never" : String(expiresInDays)}
          onChange={(e) =>
            onExpiresInDaysChange(e.target.value === "never" ? null : Number(e.target.value))
          }
        >
          {AGENT_EXPIRY_CHOICES.map((days) => (
            <option key={days ?? "never"} value={days === null ? "never" : String(days)}>
              {days === null ? t("expiryNever") : t("expiryDays", { days })}
            </option>
          ))}
        </select>
      </FieldRow>
    </>
  );
}
