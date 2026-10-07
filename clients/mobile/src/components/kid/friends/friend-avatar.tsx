import { View } from "react-native";
import { friendAvatarColor, readAvatarConfig } from "@dodi/client-state/avatars";
import type { Json } from "@dodi/types/database";

import { KidAvatar } from "../kid-avatar";
import { KidText } from "../kid-text";

interface FriendAvatarProps {
  /** Name or handle: drives both the initial and the fallback color. */
  label: string;
  /** The friend's chosen look from their sealed card (animal + color). */
  avatarConfig?: Json | null;
  size?: number;
  /** A blocked friend (web: grayscale(0.7); RN has no filter, so dimmed). */
  grayscale?: boolean;
}

/**
 * Kid-palette avatar for a friend (web: components/kid/friends/friend-avatar):
 * their chosen animal on their color ring when set, else a colored circle
 * with the initial, the color hashed from the label.
 */
export function FriendAvatar({ label, avatarConfig, size = 50, grayscale = false }: FriendAvatarProps) {
  const safe = label.trim() || "?";

  if (readAvatarConfig(avatarConfig).avatar) {
    return (
      <KidAvatar kid={{ display_name: safe, avatar_config: avatarConfig ?? null }} size={size} isMuted={grayscale} />
    );
  }

  const c = friendAvatarColor(safe);
  return (
    <View
      className="shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: c.bg, opacity: grayscale ? 0.6 : 1 }}
      // Decorative: the friend's name is beside it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <KidText className="font-extrabold" style={{ color: c.fg, fontSize: Math.round(size * 0.4) }}>
        {safe[0].toUpperCase()}
      </KidText>
    </View>
  );
}
