"use client";

import { useProfiles } from "@/hooks/use-profiles";

const AVATAR_PALETTE = [
  { bg: "bg-primary-soft-2", fg: "text-primary" },
  { bg: "bg-success-soft", fg: "text-success" },
  { bg: "bg-[#EFE9FA]", fg: "text-[#7456C4]" },
  { bg: "bg-[#FDF1DC]", fg: "text-[#B0782A]" },
];

function avatarColor(index: number) {
  return AVATAR_PALETTE[((index % AVATAR_PALETTE.length) + AVATAR_PALETTE.length) % AVATAR_PALETTE.length];
}

/** Client island: a profile's avatar circle with its decrypted initial. */
export function ProfileAvatar({
  profileId,
  fallbackIndex = 0,
}: {
  profileId: string;
  fallbackIndex?: number;
}) {
  const { profiles } = useProfiles();
  const index = profiles?.findIndex((p) => p.id === profileId) ?? -1;
  const profile = index >= 0 ? profiles?.[index] : null;
  const color = avatarColor(index >= 0 ? index : fallbackIndex);
  const initial = (profile?.display_name?.[0] ?? "?").toUpperCase();
  return (
    <div
      className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${color.bg} ${color.fg}`}
    >
      {initial}
    </div>
  );
}

/** Client island: a profile's decrypted display name (or a fallback). */
export function ProfileName({
  profileId,
  fallback = "—",
}: {
  profileId: string;
  fallback?: string;
}) {
  const { profiles } = useProfiles();
  const name = profiles?.find((p) => p.id === profileId)?.display_name;
  return <>{name ?? fallback}</>;
}
