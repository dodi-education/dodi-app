import { type ReactNode, useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import { type DecodedFriend, friendMatchesQuery } from "@dodi/client-state/friends";
import { input as inputRecipe, kidButton, friendsList as l } from "@dodi/ui-recipes";

import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

import { KidButton } from "../kid-button";
import { KidText } from "../kid-text";
import { FriendRow } from "./friend-row";

type Tab = "all" | "accepted" | "requests" | "blocked";

interface FriendsListProps {
  friends: DecodedFriend[];
  incoming: DecodedFriend[];
  outgoing: DecodedFriend[];
  blocked: DecodedFriend[];
  busy: boolean;
  onAdd: () => void;
  onOpen: (f: DecodedFriend) => void;
  onAccept: (f: DecodedFriend) => void;
  onDecline: (f: DecodedFriend) => void;
  onCancel: (f: DecodedFriend) => void;
  onUnblock: (f: DecodedFriend) => void;
}

function SectionLabel({ children, isFirst }: { children: ReactNode; isFirst: boolean }) {
  return <KidText className={cn(l.sectionLabel, isFirst && l.sectionLabelFirst)}>{children}</KidText>;
}

/** A labelled group of rows; renders nothing when empty. */
function Section({
  label,
  list,
  render,
  isFirst,
}: {
  label: string;
  list: DecodedFriend[];
  render: (f: DecodedFriend) => ReactNode;
  isFirst: boolean;
}) {
  if (list.length === 0) return null;
  return (
    <>
      <SectionLabel isFirst={isFirst}>{label}</SectionLabel>
      <View className={l.rows}>{list.map(render)}</View>
    </>
  );
}

/** The friends tab (web: components/kid/friends/friends-list): search, filter chips, sections. */
export function FriendsList({
  friends,
  incoming,
  outgoing,
  blocked,
  busy,
  onAdd,
  onOpen,
  onAccept,
  onDecline,
  onCancel,
  onUnblock,
}: FriendsListProps) {
  const t = useTranslations("friends");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const q = query.trim().toLowerCase();

  const visibleFriends = friends.filter((f) => friendMatchesQuery(f, q));
  const visibleBlocked = blocked.filter((f) => friendMatchesQuery(f, q));
  const visibleIncoming = incoming.filter((f) => friendMatchesQuery(f, q));
  const visibleOutgoing = outgoing.filter((f) => friendMatchesQuery(f, q));

  const counts: Record<Tab, number> = {
    all: 0,
    accepted: friends.length,
    requests: incoming.length + outgoing.length,
    blocked: blocked.length,
  };
  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: t("tabAll") },
    { key: "accepted", label: t("tabFriends") },
    { key: "requests", label: t("tabRequests") },
    { key: "blocked", label: t("tabBlocked") },
  ];

  const incomingRow = (f: DecodedFriend) => (
    <FriendRow
      key={f.id}
      friend={f}
      disabled={busy}
      onAccept={() => onAccept(f)}
      onDecline={() => onDecline(f)}
      onCancel={() => onCancel(f)}
    />
  );
  const outgoingRow = (f: DecodedFriend) => (
    <FriendRow key={f.id} friend={f} disabled={busy} onCancel={() => onCancel(f)} />
  );
  const friendRow = (f: DecodedFriend) => <FriendRow key={f.id} friend={f} onOpen={() => onOpen(f)} />;
  const blockedRow = (f: DecodedFriend) => (
    <FriendRow key={f.id} friend={f} disabled={busy} onUnblock={() => onUnblock(f)} />
  );

  const empty: Record<Tab, { icon: IconName; text: string }> = {
    all: { icon: "friends", text: q ? t("emptyFriendsSearch") : t("emptyFriends") },
    accepted: { icon: "friends", text: q ? t("emptyFriendsSearch") : t("emptyFriends") },
    requests: { icon: "user_plus", text: t("emptyRequests") },
    blocked: { icon: "ban", text: t("emptyBlocked") },
  };

  function renderEmpty(tabKey: Tab) {
    const e = empty[tabKey];
    return (
      <View className={l.empty}>
        <View className={l.emptyIcon}>
          <Icon name={e.icon} size={34} stroke={1.7} color="primary" />
        </View>
        <KidText className={cn(l.emptyText, l.textAlign)}>{e.text}</KidText>
        {(tabKey === "all" || tabKey === "accepted") && !q ? (
          <KidButton variant="play" icon="user_plus" iconStroke={2.2} onPress={onAdd}>
            {t("addFriend")}
          </KidButton>
        ) : null}
      </View>
    );
  }

  const allEmpty =
    visibleIncoming.length === 0 &&
    visibleOutgoing.length === 0 &&
    visibleFriends.length === 0 &&
    visibleBlocked.length === 0;

  const searchClasses = cn(l.searchInput, "font-kid");

  return (
    <View className={l.root}>
      <View className={l.head}>
        <View className={l.titleBlock}>
          <KidText className={l.title} accessibilityRole="header">
            {t("title")}
          </KidText>
          <KidText className={l.count}>
            {t("friendCount", { count: counts.accepted })}
            {counts.requests > 0 ? ` · ${t("requestCount", { count: counts.requests })}` : ""}
          </KidText>
        </View>
        <KidButton variant="play" icon="user_plus" iconStroke={2} onPress={onAdd}>
          {t("addFriend")}
        </KidButton>
      </View>

      <View className={l.filters}>
        <View className={cn(l.search, l.searchBorder, isSearchFocused && l.searchFocused)}>
          <Icon name="search" size={16} stroke={2.2} color="faint" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("searchPlaceholder")}
            placeholderTextColor={inputRecipe.placeholderColor}
            accessibilityLabel={t("searchPlaceholder")}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            autoCorrect={false}
            className={searchClasses}
            style={{ fontFamily: fontFamilyFor(searchClasses), paddingVertical: 0 }}
          />
        </View>
        {tabs.map((tabItem) => {
          const isActive = tab === tabItem.key;
          const count = counts[tabItem.key];
          return (
            <KidButton
              key={tabItem.key}
              variant="chip"
              size="sm"
              active={isActive}
              onPress={() => setTab(tabItem.key)}
            >
              <KidText className={cn(kidButton.text({ variant: "chip", size: "sm" }), isActive && kidButton.activeText)}>
                {tabItem.label}
              </KidText>
              {tabItem.key !== "all" && count > 0 ? (
                <View className={cn(l.chipCount, isActive ? l.chipCountActive : l.chipCountIdle)}>
                  <KidText className={l.chipCountText}>{count}</KidText>
                </View>
              ) : null}
            </KidButton>
          );
        })}
      </View>

      {tab === "all" ? (
        allEmpty ? (
          renderEmpty("all")
        ) : (
          <>
            <Section label={t("sectionIncoming")} list={visibleIncoming} render={incomingRow} isFirst />
            <Section
              label={t("sectionOutgoing")}
              list={visibleOutgoing}
              render={outgoingRow}
              isFirst={visibleIncoming.length === 0}
            />
            <Section
              label={t("sectionYourFriends")}
              list={visibleFriends}
              render={friendRow}
              isFirst={visibleIncoming.length + visibleOutgoing.length === 0}
            />
            <Section
              label={t("tabBlocked")}
              list={visibleBlocked}
              render={blockedRow}
              isFirst={visibleIncoming.length + visibleOutgoing.length + visibleFriends.length === 0}
            />
          </>
        )
      ) : tab === "accepted" ? (
        visibleFriends.length === 0 ? (
          renderEmpty("accepted")
        ) : (
          <View className={l.rows}>{visibleFriends.map(friendRow)}</View>
        )
      ) : tab === "requests" ? (
        visibleIncoming.length === 0 && visibleOutgoing.length === 0 ? (
          renderEmpty("requests")
        ) : (
          <>
            <Section label={t("sectionIncoming")} list={visibleIncoming} render={incomingRow} isFirst />
            <Section
              label={t("sectionOutgoing")}
              list={visibleOutgoing}
              render={outgoingRow}
              isFirst={visibleIncoming.length === 0}
            />
          </>
        )
      ) : visibleBlocked.length === 0 ? (
        renderEmpty("blocked")
      ) : (
        <View className={l.rows}>{visibleBlocked.map(blockedRow)}</View>
      )}
    </View>
  );
}
