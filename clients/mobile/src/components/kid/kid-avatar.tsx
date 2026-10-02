import { Image, View } from "react-native";
import {
  type AvatarConfig,
  avatarColorOf,
  avatarInitial,
  avatarRingPadding,
  readAvatarConfig,
} from "@dodi/client-state/avatars";
import type { Json } from "@dodi/types/database";

import { avatarImage } from "@/lib/avatar-images";

import { KidText } from "./kid-text";

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
  /** Desaturate (web: grayscale(0.7) on a blocked friend): dimmed here, RN has no filter. */
  isMuted?: boolean;
}

/**
 * A kid's avatar (web: components/kid/kid-avatar): the chosen character on a
 * colored ring, or, when none is picked, the name's initial on the color.
 * Colors are the kid's data (`KID_AVA_COLORS`), applied as style.
 */
export function KidAvatar({ kid, size = 34, pad, isMuted = false }: KidAvatarProps) {
  const cfg: AvatarConfig = readAvatarConfig(kid.avatar_config);
  const color = avatarColorOf(cfg);
  const img = cfg.avatar ? avatarImage(cfg.avatar) : null;

  if (!img) {
    return (
      <View
        className="shrink-0 items-center justify-center rounded-full"
        style={{ width: size, height: size, backgroundColor: color.bg, opacity: isMuted ? 0.6 : 1 }}
      >
        <KidText className="font-extrabold" style={{ color: color.fg, fontSize: Math.round(size * 0.42) }}>
          {avatarInitial(kid.display_name)}
        </KidText>
      </View>
    );
  }

  const ring = avatarRingPadding(size, pad);
  return (
    <View
      className="shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, backgroundColor: color.ring, padding: ring, opacity: isMuted ? 0.6 : 1 }}
    >
      <Image source={img} className="h-full w-full rounded-full bg-white" resizeMode="cover" />
    </View>
  );
}
