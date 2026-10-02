import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import type { DecodedFriend } from "@dodi/client-state/friends";
import { friendProfile as p } from "@dodi/ui-recipes";

import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useKidDateFormat } from "@/lib/kid-date-format";

import { KidButton } from "../kid-button";
import { kidShadowStyle } from "../kid-shadow";
import { KidText } from "../kid-text";
import { FriendAvatar } from "./friend-avatar";

interface FriendProfileProps {
  friend: DecodedFriend;
  busy: boolean;
  onBack: () => void;
  onBlock: () => void;
  onRemove: () => void;
}

function Fact({ icon, label, value, hasDivider }: { icon: IconName; label: string; value: string; hasDivider?: boolean }) {
  return (
    <View className={cn(p.fact, hasDivider && p.factDivider)}>
      <View className={p.factIcon}>
        <Icon name={icon} size={18} stroke={1.8} color="faint" />
      </View>
      <KidText className={p.factLabel}>{label}</KidText>
      <KidText className={cn(p.factValue, "flex-1")} numberOfLines={1}>
        {value}
      </KidText>
    </View>
  );
}

/** A friend's page (web: components/kid/friends/friend-profile): card, birthday, since, block / remove. */
export function FriendProfile({ friend, busy, onBack, onBlock, onRemove }: FriendProfileProps) {
  const t = useTranslations("friends");
  const { formatDate, formatDateOnly } = useKidDateFormat();
  const name = friend.name?.trim() || friend.nickname?.trim() || "—";
  const nickname = friend.name?.trim() && friend.nickname?.trim() ? friend.nickname.trim() : null;
  // Birthdate is a floating calendar date: format day-stable (no tz shift).
  const birthday = formatDateOnly(friend.birthdate) ?? t("unknownValue");
  const since = formatDate(friend.updatedAt) || t("unknownValue");

  return (
    <View className={p.root}>
      <View className="flex-row">
        <KidButton variant="back" size="sm" icon="arrow_left" iconStroke={2.2} onPress={onBack} className={p.back}>
          {t("kidBack")}
        </KidButton>
      </View>

      <View className={p.card} style={kidShadowStyle("card")}>
        <FriendAvatar label={name} avatarConfig={friend.avatarConfig} size={96} />
        <KidText className={cn(p.name, "text-center")} accessibilityRole="header">
          {name}
        </KidText>
        {nickname ? <KidText className={p.nickname}>({nickname})</KidText> : null}
        <View className={p.badge}>
          <Icon name="check" size={13} stroke={3} color="success" />
          <KidText className={p.badgeText}>{t("friendBadge")}</KidText>
        </View>

        <View className={p.facts}>
          <Fact icon="cake" label={t("birthday")} value={birthday} />
          <Fact icon="friends" label={t("friendsSince")} value={since} hasDivider />
        </View>
      </View>

      <View className={p.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onBlock}
          disabled={busy}
          className={cn(p.action, busy && "opacity-50", "active:border-ink-2")}
        >
          <Icon name="ban" size={16} stroke={2} color="ink-2" />
          <KidText className={cn(p.actionText, p.blockText)}>{t("block")}</KidText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onRemove}
          disabled={busy}
          className={cn(p.action, busy && "opacity-50", "active:bg-danger-soft")}
        >
          <Icon name="delete" size={16} stroke={2} color="danger" />
          <KidText className={cn(p.actionText, p.removeText)}>{t("removeFriend")}</KidText>
        </Pressable>
      </View>
    </View>
  );
}
