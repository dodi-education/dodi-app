"use client";

import { kidAvatarPalette } from "@dodi/ui-recipes";
import { useKids } from "@/hooks/use-kids";

/** Shared with the app (@dodi/ui-recipes). */
const AVATAR_PALETTE = kidAvatarPalette;

function avatarColor(index: number) {
  return AVATAR_PALETTE[((index % AVATAR_PALETTE.length) + AVATAR_PALETTE.length) % AVATAR_PALETTE.length];
}

/** Client island: a kid's avatar circle with its decrypted initial. */
export function KidInitialAvatar({
  kidId,
  fallbackIndex = 0,
}: {
  kidId: string;
  fallbackIndex?: number;
}) {
  const { kids } = useKids();
  const index = kids?.findIndex((p) => p.id === kidId) ?? -1;
  const kid = index >= 0 ? kids?.[index] : null;
  const color = avatarColor(index >= 0 ? index : fallbackIndex);
  const initial = (kid?.display_name?.[0] ?? "?").toUpperCase();
  return (
    <div
      className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${color.bg} ${color.fg}`}
    >
      {initial}
    </div>
  );
}

/** Client island: a kid's decrypted display name (or a fallback). */
export function KidNameLabel({
  kidId,
  fallback = "—",
}: {
  kidId: string;
  fallback?: string;
}) {
  const { kids } = useKids();
  const name = kids?.find((p) => p.id === kidId)?.display_name;
  return <>{name ?? fallback}</>;
}
