import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import { sectionMessage, textarea } from "@dodi/ui-recipes";
import {
  type ContentReportDraft,
  REPORT_CONTENT_KINDS,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  reportDraftFromQuery,
  submitContentReport,
} from "@dodi/client-state/content-report";

import { api } from "@/adapters/platform";
import { SectionFormError } from "@/components/parent/form-error";
import { FieldRow, StackField } from "@/components/parent/rows";
import { SaveRow } from "@/components/parent/save-row";
import { Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Button, Select, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";
import { useKids } from "@/lib/use-kids";

/** The kid select's "not about a specific kid" value. */
const NO_KID = "none";

/**
 * Report a problem (web: parent/report/page): the in-app flagging of AI
 * answers and games that Google Play and the App Store require. Entry points
 * pass context as params (`kind=discover_game&game=` from a Discover game).
 */
export default function ReportScreen() {
  const t = useTranslations("report");
  const params = useLocalSearchParams<{ kind?: string; game?: string; kid?: string }>();
  const { kids } = useKids();
  const [draft, setDraft] = useState<ContentReportDraft>(() =>
    reportDraftFromQuery({ kind: params.kind, game: params.game, kid: params.kid }),
  );
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailsClass = cn(textarea.box, textarea.text);

  function update(patch: Partial<ContentReportDraft>): void {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function submit(): Promise<void> {
    setIsSending(true);
    const outcome = await submitContentReport({ api }, draft, "mobile");
    setIsSending(false);
    if (outcome.kind === "sent") setIsSent(true);
    else setError(t(outcome.key));
  }

  if (isSent) {
    return (
      <ShellContent>
        <Section>
          <View className={sectionMessage.box}>
            <Text className={sectionMessage.text}>{t("sent")}</Text>
          </View>
          <SaveRow>
            <Button
              variant="outline"
              onPress={() => {
                setDraft(reportDraftFromQuery({}));
                setIsSent(false);
              }}
            >
              {t("sendAnother")}
            </Button>
          </SaveRow>
        </Section>
      </ShellContent>
    );
  }

  const isGameReport = draft.contentKind !== "companion_answer";

  return (
    <ShellContent>
      <Text className="mb-4 text-[13px] text-muted-foreground">{t("description")}</Text>

      <Section>
        <FieldRow label={t("kindLabel")}>
          <Select<ContentReportDraft["contentKind"]>
            label={t("kindLabel")}
            value={draft.contentKind}
            options={REPORT_CONTENT_KINDS.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) }))}
            onValueChange={(contentKind) => update({ contentKind })}
          />
        </FieldRow>
        <FieldRow label={t("kidLabel")}>
          <Select<string>
            label={t("kidLabel")}
            value={draft.kidId ?? NO_KID}
            options={[
              { value: NO_KID, label: t("kidNone") },
              ...(kids ?? []).map((kid) => ({ value: kid.id, label: kid.display_name })),
            ]}
            onValueChange={(kidId) => update({ kidId: kidId === NO_KID ? null : kidId })}
          />
        </FieldRow>
        <FieldRow label={t("reasonLabel")} required>
          <Select<ContentReportDraft["reason"]>
            label={t("reasonLabel")}
            value={draft.reason || null}
            placeholder={t("reasonLabel")}
            options={REPORT_REASONS.map((reason) => ({ value: reason, label: t(`reasons.${reason}`) }))}
            onValueChange={(reason) => update({ reason })}
          />
        </FieldRow>
        {isGameReport && draft.gameId ? (
          <StackField>
            <Text className="text-[13px] text-muted-foreground">{t("gameAttached")}</Text>
          </StackField>
        ) : null}
      </Section>

      <Section title={t("detailsLabel")} desc={t("detailsHint")}>
        <StackField>
          <TextInput
            value={draft.details}
            onChangeText={(details) => update({ details })}
            maxLength={REPORT_DETAILS_MAX_LENGTH}
            multiline
            textAlignVertical="top"
            placeholder={t("detailsPlaceholder")}
            placeholderTextColor={textarea.placeholderColor}
            accessibilityLabel={t("detailsLabel")}
            className={detailsClass}
            style={{ fontFamily: fontFamilyFor(detailsClass) }}
          />
        </StackField>
        {error ? <SectionFormError>{error}</SectionFormError> : null}
        <SaveRow>
          <Button isLoading={isSending} disabled={isSending} onPress={() => void submit()}>
            {isSending ? t("sending") : t("submit")}
          </Button>
        </SaveRow>
      </Section>
    </ShellContent>
  );
}
