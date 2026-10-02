import { View } from "react-native";
import { gamePlayNotice as n } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A centered notice on the play pages (web: the offline / no-kid / unreadable
 * boxes of game-play-page and snapshots/[id]): an icon line or a title + body.
 */
export function GamePlayNotice({ offlineText, title, body }: { offlineText?: string; title?: string; body?: string }) {
  return (
    <View className={cn(n.box, "self-center")} accessibilityRole={offlineText ? "alert" : undefined}>
      {offlineText ? (
        <>
          <View className={n.icon}>
            <Icon name="wifi_off" size={28} color="muted-foreground" />
          </View>
          <KidText className={cn(n.text, n.textAlign)}>{offlineText}</KidText>
        </>
      ) : (
        <>
          <KidText className={cn(n.title, n.textAlign)} accessibilityRole="header">
            {title}
          </KidText>
          <KidText className={cn(n.body, n.textAlign)}>{body}</KidText>
        </>
      )}
    </View>
  );
}
