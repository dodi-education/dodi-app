import { type Href, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { gameViewShell } from "@dodi/ui-recipes";

import { KidButton } from "@/components/kid/kid-button";
import { KidText } from "@/components/kid/kid-text";

/**
 * The kid's full-mode game view frame (web: components/games/game-view-shell)
 * as it renders on a phone: back pill + title (+ an action at the right), the
 * game below. The web's desktop companion column (DodiFullGame and its
 * quick-action chips) is `lg:` only, so a phone shows none; the companion
 * is the header's compact dodi (KidChrome).
 */
export function GameViewShell({
  backHref,
  backLabel,
  title,
  action,
  children,
}: {
  /** Destination of the back button (e.g. "/games"). */
  backHref: Href;
  /** Back button label (e.g. the "Games" section title). */
  backLabel: string;
  /** Main heading: the game (or snapshot) title. */
  title: string;
  /** Optional action at the right edge of the title bar. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <View className={gameViewShell.root}>
      <View className={gameViewShell.bar}>
        <View className={gameViewShell.back}>
          <KidButton
            variant="back"
            size="sm"
            icon="arrow_left"
            iconSize={15}
            iconStroke={2.2}
            accessibilityRole="link"
            onPress={() => router.navigate(backHref)}
          >
            {backLabel}
          </KidButton>
        </View>
        <View className={gameViewShell.titleRow}>
          <View className={gameViewShell.titleWrap}>
            <KidText className={gameViewShell.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </KidText>
          </View>
          {action}
        </View>
      </View>
      <View className={gameViewShell.cols}>
        <View className={gameViewShell.content}>{children}</View>
      </View>
    </View>
  );
}
