import { View } from "react-native";
import { useTranslations } from "use-intl";
import { AGENT_EXPIRY_CHOICES, AGENT_SCOPE_LABEL_KEYS } from "@dodi/client-state/authorized-clients";
import { SENSITIVE_AGENT_SCOPES, type AgentScope } from "@dodi/protocol/agent-scopes";
import { fieldRow, section } from "@dodi/ui-recipes";

import { FieldRow } from "@/components/parent/rows";
import { Icon, Select, Switch, Text } from "@/components/ui";

interface AgentGrantFieldsProps {
  /** The scopes offered as toggles (an approval only narrows what was requested). */
  scopes: readonly AgentScope[];
  selected: readonly AgentScope[];
  onSelectedChange: (selected: AgentScope[]) => void;
  /** Days; null = never expires. */
  expiresInDays: number | null;
  onExpiresInDaysChange: (days: number | null) => void;
}

/**
 * Scope toggles and the expiry choice, shared by the approval card and the
 * access key form (web: access/agent-grant-fields). Every row carries the
 * section divider, as the web's card draws one between its children.
 */
export function AgentGrantFields({
  scopes,
  selected,
  onSelectedChange,
  expiresInDays,
  onExpiresInDaysChange,
}: AgentGrantFieldsProps) {
  const t = useTranslations("access");

  function toggle(scope: AgentScope, isOn: boolean): void {
    // Keep the canonical order of `scopes`.
    onSelectedChange(scopes.filter((s) => (s === scope ? isOn : selected.includes(s))));
  }

  const expiryOptions = AGENT_EXPIRY_CHOICES.map((days) => ({
    value: days === null ? "never" : String(days),
    label: days === null ? t("expiryNever") : t("expiryDays", { days }),
  }));

  return (
    <>
      <View className={section.divider}>
        <Text className="px-5 pt-4 pb-2 text-sm font-semibold">{t("scopesLabel")}</Text>
      </View>
      {scopes.map((scope) => {
        const keys = AGENT_SCOPE_LABEL_KEYS[scope];
        const isSensitive = SENSITIVE_AGENT_SCOPES.includes(scope);
        return (
          <FieldRow
            key={scope}
            className={section.divider}
            label={t(keys.title)}
            hint={
              <View>
                <Text className={fieldRow.hint}>{t(keys.desc)}</Text>
                {isSensitive ? (
                  <View accessibilityRole="alert" className="mt-1.5 flex-row items-start gap-1.5">
                    <Icon name="alert" size={14} color="warning" />
                    <Text className="flex-1 text-[12.5px] text-warning">{t("sensitiveWarning")}</Text>
                  </View>
                ) : null}
              </View>
            }
          >
            <Switch
              accessibilityLabel={t(keys.title)}
              checked={selected.includes(scope)}
              onCheckedChange={(isOn) => toggle(scope, isOn)}
            />
          </FieldRow>
        );
      })}
      <FieldRow label={t("expiry")} className={section.divider}>
        <Select
          label={t("expiry")}
          value={expiresInDays === null ? "never" : String(expiresInDays)}
          options={expiryOptions}
          onValueChange={(value) => onExpiresInDaysChange(value === "never" ? null : Number(value))}
        />
      </FieldRow>
    </>
  );
}
