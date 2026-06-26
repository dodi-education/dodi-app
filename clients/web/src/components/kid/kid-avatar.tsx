import Image from "next/image";

import {
  KID_AVA_COLORS,
  avatarSrc,
  readAvatarConfig,
  type AvatarConfig,
} from "@/lib/avatars";

import type { Json } from "@dodi/types/database";

interface KidAvatarProfile {
  display_name: string;
  avatar_config: Json | null;
}

interface KidAvatarProps {
  profile: KidAvatarProfile;
  /** Rendered diameter in px. */
  size?: number;
  /** Override the avatar-image ring padding (defaults to ~8% of size). */
  pad?: number;
  className?: string;
}

/**
 * A kid profile's avatar: the chosen animal/character image on a colored ring,
 * or — when no avatar is picked — the first letter of the name on the color.
 */
export function KidAvatar({ profile, size = 34, pad, className }: KidAvatarProps) {
  const cfg: AvatarConfig = readAvatarConfig(profile.avatar_config);
  const color = KID_AVA_COLORS[cfg.color] ?? KID_AVA_COLORS[0];

  if (!cfg.avatar) {
    const initial = (profile.display_name?.[0] ?? "?").toUpperCase();
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold ${className ?? ""}`}
        style={{
          width: size,
          height: size,
          background: color.bg,
          color: color.fg,
          fontSize: Math.round(size * 0.42),
        }}
      >
        {initial}
      </span>
    );
  }

  const ring = pad != null ? pad : Math.max(2, Math.round(size * 0.08));
  return (
    <span
      className={`box-border inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className ?? ""}`}
      style={{ width: size, height: size, background: color.ring, padding: ring }}
    >
      <Image
        src={avatarSrc(cfg.avatar)}
        alt=""
        width={size}
        height={size}
        className="h-full w-full rounded-full bg-white object-cover"
      />
    </span>
  );
}
