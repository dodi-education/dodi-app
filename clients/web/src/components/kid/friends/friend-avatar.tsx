/** Kid-palette avatar: a colored circle with the first initial, color hashed
 *  from the label so a given friend is always the same color. */

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
  /** Name or handle — drives both the initial and the color. */
  label: string;
  size?: number;
  grayscale?: boolean;
}

export function FriendAvatar({ label, size = 50, grayscale }: FriendAvatarProps) {
  const safe = label.trim() || "?";
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
