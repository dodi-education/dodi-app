import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { type DecodedFriend, friendDisplayParts } from "@dodi/client-state/friends";
import { friendRow as r } from "@dodi/ui-recipes";

import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

import { kidShadowStyle } from "../kid-shadow";
import { KidText } from "../kid-text";
import { FriendAvatar } from "./friend-avatar";

interface FriendRowProps {
  friend: DecodedFriend;
  onOpen?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onUnblock?: () => void;
  disabled?: boolean;
}

function NameLabel({ primary, suffix }: { primary: string; suffix: string | null }) {
  return (
    <KidText className={r.name} numberOfLines={1}>
      {primary}
      {suffix ? <KidText className={r.nameSuffix}> ({suffix})</KidText> : null}
    </KidText>
  );
}

function Status({ text, tone }: { text: string; tone: "request" | "muted" }) {
  return (
    <KidText className={cn(r.status, tone === "request" ? r.statusRequest : r.statusMuted)} numberOfLines={1}>
      {text}
    </KidText>
  );
}

/** The round ✕ (decline / withdraw), 40pt with slop to 44. */
function DeclineButton({ onPress, disabled, label }: { onPress?: () => void; disabled?: boolean; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className={cn(r.decline, disabled && "opacity-50", "active:bg-danger-soft")}
    >
      <Icon name="close" size={16} stroke={2.4} color="muted-foreground" />
    </Pressable>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <View className={r.waiting}>
      <Icon name="clock" size={13} stroke={2.2} color="muted-foreground" />
      <KidText className={r.waitingText} numberOfLines={1}>
        {text}
      </KidText>
    </View>
  );
}

/**
 * One friend, request or blocked kid (web: components/kid/friends/friend-row).
 * The real name wins; the kid's own nickname stands in until a card arrives.
 */
export function FriendRow({ friend, onOpen, onAccept, onDecline, onCancel, onUnblock, disabled }: FriendRowProps) {
  const t = useTranslations("friends");
  const { primary, suffix } = friendDisplayParts(friend);
  // Which parent is still holding things up, from this kid's perspective.
  const awaitingLabel = friend.myParentPending ? t("awaitingYourParent") : t("awaitingFriendsParent");
  const shadow = kidShadowStyle("row");

  if (friend.status === "accepted") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={suffix ? `${primary} (${suffix})` : primary}
        onPress={onOpen}
        className={cn(r.box, "active:opacity-80")}
        style={shadow}
      >
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <View className={r.main}>
          <NameLabel primary={primary} suffix={suffix} />
        </View>
        <Icon name="chevron_right" size={20} color="border-strong" />
      </Pressable>
    );
  }

  if (friend.status === "pending" && friend.role === "addressee") {
    return (
      <View className={cn(r.box, r.incoming)} style={shadow}>
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <View className={r.main}>
          <NameLabel primary={primary} suffix={suffix} />
          <Status text={t("wantsToBeFriends")} tone="request" />
        </View>
        <View className={r.actions}>
          <DeclineButton onPress={onDecline} disabled={disabled} label={t("reject")} />
          <Pressable
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            onPress={onAccept}
            disabled={disabled}
            className={cn(r.accept, disabled && "opacity-50", "active:opacity-80")}
            style={kidShadowStyle("play")}
          >
            <Icon name="check" size={15} stroke={2.6} color="primary-foreground" />
            <KidText className={r.acceptText}>{t("accept")}</KidText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (friend.status === "awaiting_parent" && friend.role === "addressee") {
    // This kid already accepted; the friendship is waiting on a parent.
    return (
      <View className={r.box} style={shadow}>
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <View className={r.main}>
          <NameLabel primary={primary} suffix={suffix} />
          <Status text={t("youAccepted")} tone="muted" />
        </View>
        <View className={r.actions}>
          <Waiting text={awaitingLabel} />
          <DeclineButton onPress={onCancel} disabled={disabled} label={t("reject")} />
        </View>
      </View>
    );
  }

  if (friend.status === "pending" || friend.status === "awaiting_parent") {
    // Outgoing request (this kid asked); awaiting_parent shows the parent gate.
    const pendingLabel = friend.status === "awaiting_parent" ? awaitingLabel : t("pending");
    return (
      <View className={r.box} style={shadow}>
        <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} />
        <View className={r.main}>
          <NameLabel primary={primary} suffix={suffix} />
          <Status text={t("requestSent")} tone="muted" />
        </View>
        <View className={r.actions}>
          <Waiting text={pendingLabel} />
          <DeclineButton onPress={onCancel} disabled={disabled} label={t("reject")} />
        </View>
      </View>
    );
  }

  // blocked
  return (
    <View className={cn(r.box, r.blocked)} style={shadow}>
      <FriendAvatar label={primary} avatarConfig={friend.avatarConfig} grayscale />
      <View className={r.main}>
        <NameLabel primary={primary} suffix={suffix} />
        <Status text={t("blocked")} tone="muted" />
      </View>
      <Pressable
        hitSlop={{ top: 4, bottom: 4 }}
        accessibilityRole="button"
        onPress={onUnblock}
        disabled={disabled}
        className={cn(r.unblock, disabled && "opacity-50", "active:bg-primary-soft")}
      >
        <KidText className={r.unblockText}>{t("unblock")}</KidText>
      </Pressable>
    </View>
  );
}
