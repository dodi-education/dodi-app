import Image from "next/image";

import {
  avatarColorOf,
  avatarInitial,
  avatarRingPadding,
} from "@dodi/client-state/avatars";

import {
  avatarImage,
  readAvatarConfig,
  type AvatarConfig,
} from "@/lib/avatars";

import type { Json } from "@dodi/types/database";

interface KidAvatarData {
  display_name: string;
  avatar_config: Json | null;
}

interface KidAvatarProps {
  kid: KidAvatarData;
  /** Rendered diameter in px. */
  size?: number;
  /** Override the avatar-image ring padding (defaults to ~8% of size). */
  pad?: number;
  className?: string;
}

/**
 * A kid's avatar: the chosen animal/character image on a colored ring,
 * or — when no avatar is picked — the first letter of the name on the color.
 */
export function KidAvatar({ kid, size = 34, pad, className }: KidAvatarProps) {
  const cfg: AvatarConfig = readAvatarConfig(kid.avatar_config);
  const color = avatarColorOf(cfg);
  const img = cfg.avatar ? avatarImage(cfg.avatar) : null;

  if (!img) {
    const initial = avatarInitial(kid.display_name);
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

  const ring = avatarRingPadding(size, pad);
  return (
    <span
      className={`box-border inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className ?? ""}`}
      style={{ width: size, height: size, background: color.ring, padding: ring }}
    >
      <Image
        src={img}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="h-full w-full rounded-full bg-white object-cover"
      />
    </span>
  );
}
