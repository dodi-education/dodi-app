"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { useProfiles } from "@/hooks/use-profiles";
import {
  type PendingApproval,
  fetchApprovals,
  formatHandle,
  readApprovalCounterpart,
  setApproval,
} from "@/lib/friends";
import { useVaultStore } from "@/stores/vault-store";

interface DecodedApproval extends PendingApproval {
  /** This parent's own child (always decryptable). */
  child: string;
  /** "<requester> wants to add <target>" parts. */
  requester: string;
  target: string;
}

/**
 * Friendships across the parent's kids awaiting this parent's final approval,
 * split into Incoming (someone wants to add this child) and Outgoing (this child
 * is adding someone). Both kids are shown by real name: the parent's own child is
 * decrypted from the profile list, and the counterpart is decrypted client-side
 * — the kid's nickname for outgoing, the requester's sealed preview card for
 * incoming — falling back to the public `@handle` if it can't be read. Renders
 * nothing when there's nothing to approve.
 */
export function FriendApprovals() {
  const t = useTranslations("friends");
  const { formatDate } = useDateFormat();
  const { profiles } = useProfiles();
  const session = useVaultStore((s) => s.session);
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchApprovals());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // Mount fetch: load() sets state asynchronously after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const decoded = useMemo<DecodedApproval[]>(() => {
    if (!items) return [];
    return items.map((a) => {
      const kid = profiles?.find((p) => p.id === a.profileId) ?? null;
      const child = kid?.display_name ?? "—";
      const other =
        (session
          ? readApprovalCounterpart(session, a, kid?.friend_secret_keys ?? null)
          : null) ?? formatHandle(a.counterpartSocialId);
      return {
        ...a,
        child,
        requester: a.side === "requester" ? child : other,
        target: a.side === "requester" ? other : child,
      };
    });
  }, [items, profiles, session]);

  if (!items || items.length === 0) return null;

  async function act(approval: PendingApproval, approve: boolean) {
    const key = approval.friendshipId + approval.side;
    setBusy(key);
    try {
      await setApproval(approval.friendshipId, approval.side, approve);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const incoming = decoded.filter((a) => a.side === "addressee");
  const outgoing = decoded.filter((a) => a.side === "requester");

  const renderRow = (a: DecodedApproval) => (
    <Row key={a.friendshipId + a.side}>
      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold text-primary">
        {a.child[0]?.toUpperCase()}
      </div>
      <RowMain>
        <RowTitle>
          {t("approvalSummary", { requester: a.requester, target: a.target })}
        </RowTitle>
        <RowMeta>{t("sentOn", { date: formatDate(a.createdAt) })}</RowMeta>
      </RowMain>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy != null}
          onClick={() => void act(a, false)}
        >
          {t("reject")}
        </Button>
        <Button
          size="sm"
          disabled={busy != null}
          onClick={() => void act(a, true)}
        >
          {t("approve")}
        </Button>
      </div>
    </Row>
  );

  return (
    <>
      {incoming.length > 0 ? (
        <Section title={t("approvalsIncomingTitle")}>
          {incoming.map(renderRow)}
        </Section>
      ) : null}
      {outgoing.length > 0 ? (
        <Section title={t("approvalsOutgoingTitle")}>
          {outgoing.map(renderRow)}
        </Section>
      ) : null}
    </>
  );
}
