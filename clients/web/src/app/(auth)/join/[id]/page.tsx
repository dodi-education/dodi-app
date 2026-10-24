"use client";

import { useParams } from "next/navigation";

import { JoinFamily } from "@/components/auth/join/join-family";

/**
 * A family invitation link: /join/{id}#k={secret}. The secret stays in the
 * fragment, which never reaches a server; see components/auth/join.
 */
export default function JoinPage() {
  const { id } = useParams<{ id: string }>();
  return <JoinFamily invitationId={id} />;
}
