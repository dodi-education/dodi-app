"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { useFriends } from "@/hooks/use-friends";
import type { DecodedFriend } from "@/lib/friends";

import { AddFriend } from "./add-friend";
import { FriendProfile } from "./friend-profile";
import { FriendsList } from "./friends-list";

type View = { mode: "list" } | { mode: "add" } | { mode: "profile"; id: string };

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-sm font-semibold text-muted-foreground">
      {children}
    </div>
  );
}

export function FriendsApp({ profileId }: { profileId: string }) {
  const t = useTranslations("friends");
  const f = useFriends(profileId);
  const { reload } = f;
  const searchParams = useSearchParams();
  const router = useRouter();

  // Deep link from a scanned QR (`/friends?add=<code>`): open the add screen
  // with the code pre-filled. Initialized straight from the param (no effect
  // setState) so the server and client agree on first render.
  const addParam = searchParams.get("add");
  const [view, setView] = useState<View>(
    addParam ? { mode: "add" } : { mode: "list" },
  );
  const [pendingCode, setPendingCode] = useState<string | null>(addParam);

  // Strip the param so a refresh or later manual "Add a friend" starts blank.
  useEffect(() => {
    if (addParam) router.replace("/friends");
  }, [addParam, router]);

  // Re-tapping the friends tab while already on it returns to the list and
  // reloads (mirrors how the games tab resets from a game detail). The bottom
  // nav broadcasts this because a Link to the current URL is otherwise a no-op.
  useEffect(() => {
    function onReselect(event: Event) {
      const href = (event as CustomEvent<{ href: string }>).detail?.href;
      if (href && href !== "/friends") return;
      setView({ mode: "list" });
      setPendingCode(null);
      reload();
    }
    window.addEventListener("kid-tab-reselect", onReselect);
    return () => window.removeEventListener("kid-tab-reselect", onReselect);
  }, [reload]);

  if (f.error === "locked") {
    return <Centered>{t("errorVaultLocked")}</Centered>;
  }
  if (f.loading || !f.profile) {
    return (
      <Centered>
        <Icon name="loading" size={28} className="animate-spin text-primary" />
      </Centered>
    );
  }

  async function confirmAndRun(message: string, run: Promise<void>) {
    if (!window.confirm(message)) return;
    await run;
    setView({ mode: "list" });
  }

  if (view.mode === "add") {
    // Best-known display name for someone we already have a relationship with —
    // used to make "already friends / request exists" errors name the right kid.
    const resolveName = (handle: string): string | null => {
      const match = [
        ...f.friends,
        ...f.incoming,
        ...f.outgoing,
        ...f.blocked,
      ].find((x) => (x.handle ?? "").toLowerCase() === handle.toLowerCase());
      return match ? match.name?.trim() || match.nickname?.trim() || null : null;
    };
    return (
      <AddFriend
        myHandle={f.myHandle}
        busy={f.busy}
        initialCode={pendingCode ?? undefined}
        onBack={() => setView({ mode: "list" })}
        onSendRequest={f.sendRequest}
        resolveName={resolveName}
      />
    );
  }

  if (view.mode === "profile") {
    const friend = f.friends.find((x) => x.id === view.id);
    if (friend) {
      const name = friend.name?.trim() || friend.nickname?.trim() || "—";
      return (
        <FriendProfile
          friend={friend}
          busy={f.busy}
          onBack={() => setView({ mode: "list" })}
          onBlock={() =>
            void confirmAndRun(t("confirmBlock", { name }), f.block(friend))
          }
          onRemove={() =>
            void confirmAndRun(t("confirmRemove", { name }), f.remove(friend))
          }
        />
      );
    }
    // Friend no longer present (e.g. just removed) — fall back to the list.
  }

  return (
    <FriendsList
      friends={f.friends}
      incoming={f.incoming}
      outgoing={f.outgoing}
      blocked={f.blocked}
      busy={f.busy}
      onAdd={() => {
        setPendingCode(null);
        setView({ mode: "add" });
      }}
      onOpen={(friend: DecodedFriend) =>
        setView({ mode: "profile", id: friend.id })
      }
      onAccept={(friend) => void f.accept(friend)}
      onDecline={(friend) => void f.reject(friend)}
      onCancel={(friend) => void f.cancel(friend)}
      onUnblock={(friend) => void f.unblock(friend)}
    />
  );
}
