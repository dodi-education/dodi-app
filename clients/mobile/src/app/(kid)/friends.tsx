import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { friendsList, friendsNoKid } from "@dodi/ui-recipes";

import { BrowseContext } from "@/components/kid/browse-context";
import { FriendsApp } from "@/components/kid/friends/friends-app";
import { KidText } from "@/components/kid/kid-text";
import { cn } from "@/lib/cn";
import { useActiveKid } from "@/lib/use-active-kid";

/**
 * The friends tab (web: app/(kid)/friends/page). A `?add=<code>` deep link
 * opens Add a friend with the code filled in.
 */
export default function FriendsScreen() {
  const t = useTranslations("friends");
  const router = useRouter();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { activeKidId } = useActiveKid();
  // Read once, then strip the param so a later "Add a friend" starts blank.
  const [addCode] = useState(() => (typeof add === "string" && add ? add : null));

  useEffect(() => {
    if (add) router.setParams({ add: undefined });
  }, [add, router]);

  if (!activeKidId) {
    return (
      <View className={friendsNoKid.root}>
        <KidText className={friendsList.title} accessibilityRole="header">
          {t("title")}
        </KidText>
        <KidText className={cn(friendsNoKid.text, friendsNoKid.textAlign)}>
          {t("emptyFriends")}
        </KidText>
      </View>
    );
  }

  return (
    <BrowseContext kidId={activeKidId}>
      {/* key on the kid: a switch remounts, so per-kid state never bleeds across. */}
      <FriendsApp key={activeKidId} kidId={activeKidId} initialAddCode={addCode} />
    </BrowseContext>
  );
}
