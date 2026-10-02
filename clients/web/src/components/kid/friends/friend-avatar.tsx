/** Kid-palette avatar for a friend: their chosen animal on their chosen color
 *  ring when set, otherwise a colored circle with the first initial, color
 *  hashed from the label so a given friend is always the same color. */

import { friendAvatarColor } from "@dodi/client-state/avatars";

import { KidAvatar } from "@/components/kid/kid-avatar";
import { readAvatarConfig } from "@/lib/avatars";

import type { Json } from "@dodi/types/database";

const colorFor = friendAvatarColor;

interface FriendAvatarProps {
  /** Name or handle — drives both the initial and the fallback color. */
  label: string;
  /** The friend's chosen look from their sealed card (animal + color). */
  avatarConfig?: Json | null;
  size?: number;
  grayscale?: boolean;
}

export function FriendAvatar({
  label,
  avatarConfig,
  size = 50,
  grayscale,
}: FriendAvatarProps) {
  const safe = label.trim() || "?";

  // When the friend picked an avatar, show it on their chosen color ring.
  if (readAvatarConfig(avatarConfig).avatar) {
    return (
      <span
        className="inline-flex shrink-0"
        style={{ filter: grayscale ? "grayscale(0.7)" : undefined }}
      >
        <KidAvatar
          kid={{ display_name: safe, avatar_config: avatarConfig ?? null }}
          size={size}
        />
      </span>
    );
  }

  const c = colorFor(safe);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{
        width: size,
        height: size,
        background: c.bg,
        color: c.fg,
        fontSize: Math.round(size * 0.4),
        filter: grayscale ? "grayscale(0.7)" : undefined,
      }}
    >
      {safe[0].toUpperCase()}
    </div>
  );
}
