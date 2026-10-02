import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type DecodedApproval,
  type PendingApproval,
  approvalKey,
  decodeApprovals,
  fetchApprovals,
  setApproval,
  splitApprovals,
} from "@dodi/client-state/friend-approvals";
import { approvalActions, approvalAvatar } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { Section } from "@/components/parent/section";
import { Button, Text } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";
import { useAccountDateFormat } from "@/lib/date-format";
import { useKids } from "@/lib/use-kids";

/**
 * Friendships across the parent's kids awaiting this parent's final approval
 * (web: parent/friend-approvals), split into Incoming and Outgoing. Both kids
 * are named on the device (the counterpart from its sealed card or nickname,
 * else the public code). Renders nothing when there's nothing to approve.
 */
export function FriendApprovals() {
  const t = useTranslations("friends");
  const { formatDate } = useAccountDateFormat();
  const { kids } = useKids();
  const session = useVaultStore((s) => s.session);
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchApprovals(api));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // Mount fetch: load() sets state asynchronously after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const decoded = useMemo<DecodedApproval[]>(() => decodeApprovals(items, kids, session), [items, kids, session]);

  if (!items || items.length === 0) return null;

  async function act(approval: PendingApproval, approve: boolean): Promise<void> {
    setBusy(approvalKey(approval));
    try {
      await setApproval(api, approval.friendshipId, approval.side, approve);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const { incoming, outgoing } = splitApprovals(decoded);

  const renderRow = (a: DecodedApproval) => (
    <Row key={approvalKey(a)}>
      <View className={approvalAvatar.box}>
        <Text className={approvalAvatar.text}>{a.child[0]?.toUpperCase()}</Text>
      </View>
      <RowMain>
        <RowTitle>{t("approvalSummary", { requester: a.requester, target: a.target })}</RowTitle>
        <RowMeta>{t("sentOn", { date: formatDate(a.createdAt) })}</RowMeta>
      </RowMain>
      <View className={approvalActions.box}>
        <Button variant="outline" size="sm" disabled={busy != null} onPress={() => void act(a, false)}>
          {t("reject")}
        </Button>
        <Button size="sm" disabled={busy != null} onPress={() => void act(a, true)}>
          {t("approve")}
        </Button>
      </View>
    </Row>
  );

  return (
    <>
      {incoming.length > 0 ? <Section title={t("approvalsIncomingTitle")}>{incoming.map(renderRow)}</Section> : null}
      {outgoing.length > 0 ? <Section title={t("approvalsOutgoingTitle")}>{outgoing.map(renderRow)}</Section> : null}
    </>
  );
}
