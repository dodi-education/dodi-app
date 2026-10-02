"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { KidButton } from "@/components/kid/kid-button";
import { friendMatchesQuery } from "@dodi/client-state/friends";
import { friendsList } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";
import type { IconName } from "@/components/shared/icon";
import type { DecodedFriend } from "@/lib/friends";

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

const matchesQuery = friendMatchesQuery;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(friendsList.sectionLabel, friendsList.webSectionLabel)}>
      {children}
    </div>
  );
}

function Section({
  label,
  list,
  render,
}: {
  label: string;
  list: DecodedFriend[];
  render: (f: DecodedFriend) => React.ReactNode;
}) {
  if (list.length === 0) return null;
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <div className={cn(friendsList.rows, friendsList.webRows)}>{list.map(render)}</div>
    </>
  );
}

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
  const q = query.trim().toLowerCase();

  const visibleFriends = friends.filter((f) => matchesQuery(f, q));
  const visibleBlocked = blocked.filter((f) => matchesQuery(f, q));
  const visibleIncoming = incoming.filter((f) => matchesQuery(f, q));
  const visibleOutgoing = outgoing.filter((f) => matchesQuery(f, q));

  const counts: Record<Tab, number> = {
    all: 0,
    accepted: friends.length,
    requests: incoming.length + outgoing.length,
    blocked: blocked.length,
  };
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "all", label: t("tabAll") },
    { key: "accepted", label: t("tabFriends") },
    { key: "requests", label: t("tabRequests") },
    { key: "blocked", label: t("tabBlocked") },
  ];

  // Row renderers per category — FriendRow chooses its layout from the row's
  // status/role, so incoming gets accept/decline (pending) or a parent-waiting
  // row (awaiting_parent); both can be withdrawn via onCancel.
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
  const friendRow = (f: DecodedFriend) => (
    <FriendRow key={f.id} friend={f} onOpen={() => onOpen(f)} />
  );
  const blockedRow = (f: DecodedFriend) => (
    <FriendRow key={f.id} friend={f} disabled={busy} onUnblock={() => onUnblock(f)} />
  );

  const empty: Record<Tab, { icon: IconName; text: string }> = {
    all: {
      icon: "friends",
      text: q ? t("emptyFriendsSearch") : t("emptyFriends"),
    },
    accepted: {
      icon: "friends",
      text: q ? t("emptyFriendsSearch") : t("emptyFriends"),
    },
    requests: { icon: "user_plus", text: t("emptyRequests") },
    blocked: { icon: "ban", text: t("emptyBlocked") },
  };

  function renderEmpty(tabKey: Tab) {
    const e = empty[tabKey];
    return (
      <div className={cn(friendsList.empty, friendsList.webEmpty)}>
        <div
          className={cn(
            friendsList.emptyIcon,
            friendsList.emptyIconText,
            friendsList.webEmptyIcon,
          )}
        >
          <Icon name={e.icon} size={34} stroke={1.7} />
        </div>
        <div className={friendsList.emptyText}>
          {e.text}
        </div>
        {(tabKey === "all" || tabKey === "accepted") && !q ? (
          <KidButton variant="play" onClick={onAdd}>
            <Icon name="user_plus" stroke={2.2} />
            {t("addFriend")}
          </KidButton>
        ) : null}
      </div>
    );
  }

  const allEmpty =
    visibleIncoming.length === 0 &&
    visibleOutgoing.length === 0 &&
    visibleFriends.length === 0 &&
    visibleBlocked.length === 0;

  return (
    <div className={friendsList.root}>
      <div className={cn(friendsList.head, friendsList.webHead)}>
        <div>
          <h1 className={friendsList.title}>
            {t("title")}
          </h1>
          <div className={friendsList.count}>
            {t("friendCount", { count: counts.accepted })}
            {counts.requests > 0
              ? ` · ${t("requestCount", { count: counts.requests })}`
              : ""}
          </div>
        </div>
        <KidButton variant="play" onClick={onAdd}>
          <Icon name="user_plus" stroke={2} />
          {t("addFriend")}
        </KidButton>
      </div>

      <div className={cn(friendsList.filters, friendsList.webFilters)}>
        <label
          className={cn(
            friendsList.search,
            friendsList.searchText,
            friendsList.webSearch,
          )}
        >
          <Icon name="search" size={16} stroke={2.2} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className={cn(friendsList.searchInput, friendsList.webSearchInput)}
          />
        </label>
        {tabs.map((tabItem) => (
          <KidButton
            key={tabItem.key}
            variant="chip"
            size="sm"
            active={tab === tabItem.key}
            onClick={() => setTab(tabItem.key)}
          >
            {tabItem.label}
            {tabItem.key !== "all" && counts[tabItem.key] > 0 ? (
              <span
                className={cn(
                  friendsList.chipCount,
                  friendsList.chipCountText,
                  friendsList.webChipCount,
                  tab === tabItem.key
                    ? friendsList.chipCountActive
                    : friendsList.chipCountIdle,
                )}
              >
                {counts[tabItem.key]}
              </span>
            ) : null}
          </KidButton>
        ))}
      </div>

      {tab === "all" ? (
        allEmpty ? (
          renderEmpty("all")
        ) : (
          <>
            <Section
              label={t("sectionIncoming")}
              list={visibleIncoming}
              render={incomingRow}
            />
            <Section
              label={t("sectionOutgoing")}
              list={visibleOutgoing}
              render={outgoingRow}
            />
            <Section
              label={t("sectionYourFriends")}
              list={visibleFriends}
              render={friendRow}
            />
            <Section
              label={t("tabBlocked")}
              list={visibleBlocked}
              render={blockedRow}
            />
          </>
        )
      ) : tab === "accepted" ? (
        visibleFriends.length === 0 ? (
          renderEmpty("accepted")
        ) : (
          <div className={cn(friendsList.rows, friendsList.webRows)}>{visibleFriends.map(friendRow)}</div>
        )
      ) : tab === "requests" ? (
        visibleIncoming.length === 0 && visibleOutgoing.length === 0 ? (
          renderEmpty("requests")
        ) : (
          <>
            <Section
              label={t("sectionIncoming")}
              list={visibleIncoming}
              render={incomingRow}
            />
            <Section
              label={t("sectionOutgoing")}
              list={visibleOutgoing}
              render={outgoingRow}
            />
          </>
        )
      ) : visibleBlocked.length === 0 ? (
        renderEmpty("blocked")
      ) : (
        <div className={cn(friendsList.rows, friendsList.webRows)}>{visibleBlocked.map(blockedRow)}</div>
      )}
    </div>
  );
}
