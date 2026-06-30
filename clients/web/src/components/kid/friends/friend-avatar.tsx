/** Kid-palette avatar for a friend: their chosen animal on their chosen color
 *  ring when set, otherwise a colored circle with the first initial, color
 *  hashed from the label so a given friend is always the same color. */

import { KidAvatar } from "@/components/kid/kid-avatar";
import { readAvatarConfig } from "@/lib/avatars";

import type { Json } from "@dodi/types/database";

const PALETTE = [
  { bg: "#DCE9FA", fg: "#2F6BD8" },
  { bg: "#E9F5F0", fg: "#2E8B6A" },
  { bg: "#EFE9FA", fg: "#7456C4" },
  { bg: "#FDF1DC", fg: "#B0782A" },
  { bg: "#FBEAF1", fg: "#C2558A" },
  { bg: "#E2F3F3", fg: "#2E8B8B" },
];

function colorFor(seed: string) {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return PALETTE[sum % PALETTE.length];
}

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
