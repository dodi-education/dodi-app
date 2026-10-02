import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";
import { type CitationEntry, tokenizeDossier } from "@dodi/client-state/kid-memory";
import { dossierView } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";

/**
 * Read-only dossier (web: parent/dossier-view): `[source:<id>]` markers become
 * numbered [1][2] citations. Tapping one shows the decrypted transcript turn
 * the memory was observed in, in the web's popover card, right under the
 * dossier (a phone has no hover, and React Native can't anchor a box to a
 * word inside running text); tapping it again closes it.
 */
export function DossierView({
  dossier,
  kidName,
  entriesBySourceId,
}: {
  dossier: string;
  kidName: string;
  /** memory_source_id → cited entry; a missing id renders a fallback. */
  entriesBySourceId: Map<string, CitationEntry>;
}) {
  const t = useTranslations("memory");
  const { formatDateTime } = useAccountDateFormat();
  // Index of the OPEN citation token (the same source cited twice opens per occurrence).
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const tokens = tokenizeDossier(dossier);
  const open = openIndex !== null ? tokens[openIndex] : null;
  const entry = open?.type === "citation" ? entriesBySourceId.get(open.sourceId) : undefined;

  return (
    <View>
      <ScrollView className={dossierView.box} nestedScrollEnabled>
        <Text className={dossierView.text}>
          {tokens.map((tok, i) =>
            tok.type === "text" ? (
              tok.text
            ) : (
              <Text
                key={i}
                accessibilityRole="button"
                accessibilityLabel={t("citationLabel", { num: tok.num })}
                accessibilityState={{ expanded: openIndex === i }}
                onPress={() => setOpenIndex(openIndex === i ? null : i)}
                className={dossierView.citation}
              >
                {`[${tok.num}]`}
              </Text>
            ),
          )}
        </Text>
      </ScrollView>
      {open ? (
        <View className={dossierView.popover} accessibilityLiveRegion="polite">
          {entry ? (
            <>
              <Text className={cn(dossierView.popoverSize, dossierView.popoverMeta)}>
                {entry.role === "kid" ? kidName : "dodi"} · {formatDateTime(entry.occurredAt)}
              </Text>
              <Text className={cn(dossierView.popoverSize, dossierView.popoverText)}>{entry.text}</Text>
            </>
          ) : (
            <Text className={cn(dossierView.popoverSize, dossierView.popoverMissing)}>{t("citationMissing")}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
