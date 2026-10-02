import { View } from "react-native";
import { useTranslations } from "use-intl";
import { ACTIVITY_EVENT_TYPES, type ActivityFilters as Filters, activityEventLabel } from "@dodi/client-state/activities";
import { activityFilters } from "@dodi/ui-recipes";

import { Select } from "@/components/ui";

/**
 * Kid, persona and event filters above the activity feed (web: the three
 * 180px Selects on parent/activities). "all" is each filter's first option.
 */
export function ActivityFilters({
  filters,
  kids,
  personas,
  onChange,
}: {
  filters: Filters;
  kids: { id: string; name: string }[];
  personas: { id: string; name: string }[];
  onChange: (filters: Filters) => void;
}) {
  const t = useTranslations("activities");
  return (
    <View className={activityFilters.box}>
      <Select
        value={filters.kidId}
        label={t("filterKid")}
        className={activityFilters.trigger}
        options={[{ value: "all", label: t("filterKid") }, ...kids.map((k) => ({ value: k.id, label: k.name }))]}
        onValueChange={(kidId) => onChange({ ...filters, kidId })}
      />
      <Select
        value={filters.personaId}
        label={t("filterPersona")}
        className={activityFilters.trigger}
        options={[
          { value: "all", label: t("filterPersona") },
          ...personas.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onValueChange={(personaId) => onChange({ ...filters, personaId })}
      />
      <Select
        value={filters.event}
        label={t("filterEvent")}
        className={activityFilters.trigger}
        options={[
          { value: "all", label: t("filterEvent") },
          ...ACTIVITY_EVENT_TYPES.map((ev) => ({ value: ev, label: activityEventLabel(ev, t) })),
        ]}
        onValueChange={(event) => onChange({ ...filters, event })}
      />
    </View>
  );
}
