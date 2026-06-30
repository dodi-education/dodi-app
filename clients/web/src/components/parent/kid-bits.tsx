"use client";

import { useKids } from "@/hooks/use-kids";

const AVATAR_PALETTE = [
  { bg: "bg-primary-soft-2", fg: "text-primary" },
  { bg: "bg-success-soft", fg: "text-success" },
  { bg: "bg-[#EFE9FA]", fg: "text-[#7456C4]" },
  { bg: "bg-[#FDF1DC]", fg: "text-[#B0782A]" },
];

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
