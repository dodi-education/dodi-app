import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import { type DecodedFriend, resolveFriendName } from "@dodi/client-state/friends";
import { friendsCentered } from "@dodi/ui-recipes";

import { Button, Dialog, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useConnectivityStore } from "@/lib/client-state";
import { onKidTabReselect } from "@/lib/kid-tab-reselect";
import { useFriends } from "@/lib/use-friends";

import { KidText } from "../kid-text";
import { AddFriend } from "./add-friend";
import { FriendProfile } from "./friend-profile";
import { FriendsList } from "./friends-list";

type View_ = { mode: "list" } | { mode: "add" } | { mode: "kid"; id: string };

function Centered({ children }: { children: ReactNode }) {
  return <View className={cn(friendsCentered.box, friendsCentered.web)}>{children}</View>;
}

function CenteredText({ children }: { children: ReactNode }) {
  return <KidText className={cn(friendsCentered.text, friendsCentered.textAlign)}>{children}</KidText>;
}

interface PendingConfirm {
  message: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

/**
 * The friends tab for one kid (web: components/kid/friends/friends-app): the
 * list, a friend's page, and Add a friend (also opened by a `?add=<code>`
 * deep link). Online only: pairing and the card exchange need the platform.
 */
export function FriendsApp({ kidId, initialAddCode }: { kidId: string; initialAddCode?: string | null }) {
  const t = useTranslations("friends");
  const tp = useTranslations("kidProfile");
  const f = useFriends(kidId);
  const { reload } = f;
  const isOnline = useConnectivityStore((s) => s.isOnline);

  const [view, setView] = useState<View_>(initialAddCode ? { mode: "add" } : { mode: "list" });
  const [pendingCode, setPendingCode] = useState<string | null>(initialAddCode ?? null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  // Re-tapping the friends tab while on it returns to the list and reloads.
  useEffect(
    () =>
      onKidTabReselect((href) => {
        if (href !== "/friends") return;
        setView({ mode: "list" });
        setPendingCode(null);
        reload();
      }),
    [reload],
  );

  if (!isOnline) {
    return (
      <Centered>
        <Icon name="wifi_off" size={28} color="muted-foreground" />
        <CenteredText>{t("offlineUnavailable")}</CenteredText>
      </Centered>
    );
  }

  if (f.error === "locked") {
    return (
      <Centered>
        <CenteredText>{t("errorVaultLocked")}</CenteredText>
      </Centered>
    );
  }
  if (f.loading || !f.kid) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </Centered>
    );
  }

  // Web: window.confirm. The app asks in the kit's Dialog.
  const confirmDialog = (
    <Dialog
      isOpen={confirm !== null}
      onClose={() => setConfirm(null)}
      title={confirm?.message ?? ""}
      footer={
        <>
          <Button
            variant="destructive"
            onPress={() => {
              const pending = confirm;
              setConfirm(null);
              if (!pending) return;
              void pending.run().then(() => setView({ mode: "list" }));
            }}
          >
            {confirm?.confirmLabel ?? ""}
          </Button>
          <Button variant="outline" onPress={() => setConfirm(null)}>
            {tp("cancel")}
          </Button>
        </>
      }
    />
  );

  if (view.mode === "add") {
    return (
      <AddFriend
        myHandle={f.myHandle}
        busy={f.busy}
        initialCode={pendingCode ?? undefined}
        onBack={() => setView({ mode: "list" })}
        onSendRequest={f.sendRequest}
        resolveName={(handle) => resolveFriendName(f, handle)}
      />
    );
  }

  if (view.mode === "kid") {
    const friend = f.friends.find((x) => x.id === view.id);
    if (friend) {
      const name = friend.name?.trim() || friend.nickname?.trim() || "—";
      return (
        <>
          <FriendProfile
            friend={friend}
            busy={f.busy}
            onBack={() => setView({ mode: "list" })}
            onBlock={() =>
              setConfirm({ message: t("confirmBlock", { name }), confirmLabel: t("block"), run: () => f.block(friend) })
            }
            onRemove={() =>
              setConfirm({
                message: t("confirmRemove", { name }),
                confirmLabel: t("removeFriend"),
                run: () => f.remove(friend),
              })
            }
          />
          {confirmDialog}
        </>
      );
    }
    // Friend no longer present (e.g. just removed): fall back to the list.
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
      onOpen={(friend: DecodedFriend) => setView({ mode: "kid", id: friend.id })}
      onAccept={(friend) => void f.accept(friend)}
      onDecline={(friend) => void f.reject(friend)}
      onCancel={(friend) => void f.cancel(friend)}
      onUnblock={(friend) => void f.unblock(friend)}
    />
  );
}
