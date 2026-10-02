import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { isPublicationReviewSlow } from "@dodi/client-state/game-publication";
import type { Game } from "@dodi/types/database";
import { dialogField, publishCallout as c, publishDisclosure as d } from "@dodi/ui-recipes";

import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";

/**
 * Read-only status of a submission that needs nothing from the parent: what
 * happens next, what was submitted, and (tucked away, with its cost spelled
 * out) how to send a newer version (web: publish-status-view).
 */
export function PublishStatusView({
  state,
  publication,
  isEditedSinceSubmit,
  isOutcomeEmailOn,
  monthlyLimit,
  onResubmit,
  onViewOnDiscover,
}: {
  state: "in-review" | "published";
  publication: Game;
  /** The parent changed the game's code since this copy was submitted. */
  isEditedSinceSubmit: boolean;
  /** Outcome emails are on (the default), so we can promise one. */
  isOutcomeEmailOn: boolean;
  monthlyLimit: number;
  onResubmit: () => void;
  /** Opens the published copy's preview (web: a link to /parent/games/{id}). */
  onViewOnDiscover: () => void;
}) {
  const t = useTranslations("gameStudio");
  const { formatDateTime } = useAccountDateFormat();
  const [openedAt] = useState(() => Date.now());
  const [isUpdateOpen, setIsUpdateOpen] = useState(isEditedSinceSubmit);

  const requestedAt = publication.publication_requested_at;
  const isSlow = isPublicationReviewSlow(state, requestedAt, openedAt);
  const isLive = state === "published";
  const bodyText = cn(c.text, c.bodyText);

  return (
    <View className={c.stack}>
      {isLive ? (
        <View className={cn(c.box, c.success)}>
          <Icon name="success" size={18} color="success" />
          <View className={cn(c.body, "flex-1")}>
            <Text className={bodyText}>{t("publishLiveBody")}</Text>
            <Pressable accessibilityRole="link" hitSlop={12} onPress={onViewOnDiscover} className={cn(c.link, "self-start")}>
              <Text className={cn(c.text, c.linkText)}>{t("publishViewOnDiscover")}</Text>
              <Icon name="chevron_right" size={14} color="primary" />
            </Pressable>
          </View>
        </View>
      ) : (
        <View className={cn(c.box, c.warning)}>
          <Icon name="clock" size={18} color="warning" />
          <View className={cn(c.bodyTight, "flex-1")}>
            <Text className={bodyText}>{isSlow ? t("publishReviewSlow") : t("publishReviewEta")}</Text>
            <Text className={bodyText}>{isOutcomeEmailOn ? t("publishNotifyEmail") : t("publishNotifyHere")}</Text>
          </View>
        </View>
      )}

      <Text className={dialogField.hint}>
        {t(isLive ? "publishLiveMeta" : "publishSubmittedMeta", {
          date: requestedAt ? formatDateTime(requestedAt) : "",
          min: publication.target_age_min ?? "?",
          max: publication.target_age_max ?? "?",
        })}
      </Text>

      {isEditedSinceSubmit ? (
        <View className={cn(c.compact, c.info)}>
          <Icon name="info" size={16} color="muted-foreground" />
          <Text className={cn(bodyText, "flex-1")}>
            {isLive ? t("publishEditedSinceLive") : t("publishEditedSinceSubmit")}
          </Text>
        </View>
      ) : null}

      {/* The web's <details> disclosure. */}
      <View className={d.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isUpdateOpen }}
          onPress={() => setIsUpdateOpen(!isUpdateOpen)}
          className={d.summary}
        >
          <View style={{ transform: [{ rotate: isUpdateOpen ? "90deg" : "0deg" }] }}>
            <Icon name="chevron_right" size={14} color="ink-2" />
          </View>
          <Text className={d.summaryText}>{isLive ? t("publishUpdateToggleLive") : t("publishUpdateToggle")}</Text>
        </Pressable>
        {isUpdateOpen ? (
          <View className={d.body}>
            <Text className={dialogField.note}>
              {t(isLive ? "publishUpdateLiveHint" : "publishUpdateInReviewHint", { limit: monthlyLimit })}
            </Text>
            <Button variant="outline" icon="refresh" onPress={onResubmit}>
              {t("publishResubmit")}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}
