"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { useKids } from "@/hooks/use-kids";
import {
  type DecodedApproval,
  type PendingApproval,
  approvalKey,
  decodeApprovals,
  fetchApprovals,
  setApproval,
  splitApprovals,
} from "@dodi/client-state/friend-approvals";
import { dodi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { approvalActions, approvalAvatar } from "@dodi/ui-recipes";
import { useVaultStore } from "@/stores/vault-store";

/**
 * Friendships across the parent's kids awaiting this parent's final approval,
 * split into Incoming (someone wants to add this child) and Outgoing (this child
 * is adding someone). Both kids are shown by real name: the parent's own child is
 * decrypted from the kid list, and the counterpart is decrypted client-side
 * — the kid's nickname for outgoing, the requester's sealed preview card for
 * incoming — falling back to the public `@handle` if it can't be read. Renders
 * nothing when there's nothing to approve.
 */
export function FriendApprovals() {
  const t = useTranslations("friends");
  const { formatDate } = useDateFormat();
  const { kids } = useKids();
  const session = useVaultStore((s) => s.session);
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchApprovals(dodi));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // Mount fetch: load() sets state asynchronously after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const decoded = useMemo<DecodedApproval[]>(
    () => decodeApprovals(items, kids, session),
    [items, kids, session],
  );

  if (!items || items.length === 0) return null;

  async function act(approval: PendingApproval, approve: boolean) {
    setBusy(approvalKey(approval));
    try {
      await setApproval(dodi, approval.friendshipId, approval.side, approve);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const { incoming, outgoing } = splitApprovals(decoded);

  const renderRow = (a: DecodedApproval) => (
    <Row key={approvalKey(a)}>
      <div
        className={cn(approvalAvatar.web, approvalAvatar.box, approvalAvatar.text)}
      >
        {a.child[0]?.toUpperCase()}
      </div>
      <RowMain>
        <RowTitle>
          {t("approvalSummary", { requester: a.requester, target: a.target })}
        </RowTitle>
        <RowMeta>{t("sentOn", { date: formatDate(a.createdAt) })}</RowMeta>
      </RowMain>
      <div className={cn(approvalActions.web, approvalActions.box)}>
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
