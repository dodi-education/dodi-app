import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type SnapshotKidFilter,
  type SnapshotTypeFilter,
  type SnapshotUsageFilter,
  matchesSnapshotFilters,
} from "@dodi/client-state/snapshot-filters";
import type { AccountSnapshot } from "@dodi/client-state/snapshots";
import { libraryRow, parentSnapshotRow as p } from "@dodi/ui-recipes";

import { GameActionsSheet } from "@/components/games-library/game-actions-sheet";
import { DotSep, Row, RowMain, RowMeta, RowTitle, RowTitleText } from "@/components/parent/rows";
import { PageActions, Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { SnapshotExportDialog } from "@/components/snapshots/snapshot-export-dialog";
import { SnapshotImportDialog } from "@/components/snapshots/snapshot-import-dialog";
import { Badge, Button, Icon, Select, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";
import { useAccountSnapshots } from "@/lib/use-account-snapshots";
import { useKids } from "@/lib/use-kids";

const TYPE_FILTERS: SnapshotTypeFilter[] = ["all", "manual", "autosave"];
const USAGE_FILTERS: SnapshotUsageFilter[] = ["all", "stored", "sent", "received"];

function SnapshotBadge({ snapshot }: { snapshot: AccountSnapshot }) {
  const t = useTranslations("parentSnapshots");
  const { view, senderName, sentToName } = snapshot;
  if (view.origin === "received") {
    return (
      <Badge variant="blue">
        {senderName ? t("receivedFrom", { name: senderName }) : t("receivedFromUnknown")}
      </Badge>
    );
  }
  if (view.sharedWithKidId) {
    return <Badge variant="blue">{sentToName ? t("sentTo", { name: sentToName }) : t("sentToUnknown")}</Badge>;
  }
  return <Badge variant="gray">{view.origin === "autosave" ? t("typeAutosave") : t("usageStored")}</Badge>;
}

/**
 * Every kid's snapshots for the parent (web: parent/snapshots/page), as it
 * renders on a phone: import, the kid / type / usage filters, then one row per
 * snapshot (own, received, autosave slots) with its "…" menu (Export). The
 * kid filter lists own kids first, then friend kids (the web groups them under
 * headings; the app's select sheet has none).
 */
export default function ParentSnapshotsScreen() {
  const t = useTranslations("parentSnapshots");
  const { formatDateTime } = useAccountDateFormat();
  const { kids: kidList } = useKids();
  const kids = kidList ?? [];
  const { snapshots, friendKids, loading, error, reload } = useAccountSnapshots();

  const [filterKid, setFilterKid] = useState<string>("all");
  const [filterType, setFilterType] = useState<SnapshotTypeFilter>("all");
  const [filterUsage, setFilterUsage] = useState<SnapshotUsageFilter>("all");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<AccountSnapshot | null>(null);
  // The export target stays set while the dialog closes, so it doesn't blank out.
  const [exportTarget, setExportTarget] = useState<AccountSnapshot | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Siblings can be friends: resolve which section the selected id came from.
  const kidFilter: SnapshotKidFilter =
    filterKid === "all"
      ? { kind: "all" }
      : kids.some((kid) => kid.id === filterKid)
        ? { kind: "own", kidId: filterKid }
        : { kind: "friend", kidId: filterKid };

  const filtered = snapshots.filter((s) =>
    matchesSnapshotFilters(
      {
        kidId: s.kidId,
        origin: s.view.origin,
        senderKidId: s.view.senderKidId,
        sharedWithKidId: s.view.sharedWithKidId,
      },
      { kid: kidFilter, type: filterType, usage: filterUsage },
    ),
  );
  const hasFilters = filterKid !== "all" || filterType !== "all" || filterUsage !== "all";

  const typeLabels: Record<SnapshotTypeFilter, string> = {
    all: t("filterType"),
    manual: t("typeManual"),
    autosave: t("typeAutosave"),
  };
  const usageLabels: Record<SnapshotUsageFilter, string> = {
    all: t("filterUsage"),
    stored: t("usageStored"),
    sent: t("usageSent"),
    received: t("usageReceived"),
  };
  const kidOptions = [
    { value: "all", label: t("filterKid") },
    ...kids.map((kid) => ({ value: kid.id, label: kid.display_name })),
    ...friendKids.map((friend) => ({ value: friend.id, label: friend.name ?? t("unknownKid") })),
  ];

  const emptyText = error
    ? error === "locked"
      ? t("locked")
      : t("loadFailed")
    : filtered.length === 0 && !loading
      ? hasFilters
        ? t("noResults")
        : t("noSnapshots")
      : null;

  return (
    <ShellContent>
      <PageActions>
        <Button variant="outline" icon="upload" onPress={() => setIsImportOpen(true)}>
          {t("importSnapshot")}
        </Button>
      </PageActions>

      <View className={p.filters}>
        <Select
          value={filterKid}
          options={kidOptions}
          onValueChange={setFilterKid}
          label={t("filterKid")}
          className={p.filter}
        />
        <Select
          value={filterType}
          options={TYPE_FILTERS.map((type) => ({ value: type, label: typeLabels[type] }))}
          onValueChange={setFilterType}
          label={t("filterType")}
          className={p.filter}
        />
        <Select
          value={filterUsage}
          options={USAGE_FILTERS.map((usage) => ({ value: usage, label: usageLabels[usage] }))}
          onValueChange={setFilterUsage}
          label={t("filterUsage")}
          className={p.filter}
        />
      </View>

      {emptyText ? (
        <View className={p.empty}>
          <Text className={cn(p.emptyText, p.textAlign)}>{emptyText}</Text>
        </View>
      ) : (
        <Section title={t("heading")}>
          {filtered.map((snapshot) => {
            const title = snapshot.info?.title ?? t("unreadable");
            return (
              <Row key={snapshot.view.id}>
                {snapshot.info?.thumbnail ? (
                  <Image
                    source={{ uri: snapshot.info.thumbnail }}
                    className={p.thumb}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View className={p.tile}>
                    <Icon name="camera" size={p.tileIcon.size} stroke={p.tileIcon.stroke} color="primary" />
                  </View>
                )}
                <RowMain>
                  <RowTitle>
                    <RowTitleText>{title}</RowTitleText>
                  </RowTitle>
                  <RowMeta numberOfLines={1}>
                    {snapshot.info?.gameTitle ? (
                      <>
                        {snapshot.info.gameTitle}
                        <DotSep />
                      </>
                    ) : null}
                    {snapshot.kidName}
                    <DotSep />
                    {formatDateTime(snapshot.view.createdAt)}
                  </RowMeta>
                </RowMain>
                <SnapshotBadge snapshot={snapshot} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("snapshotActions", { title })}
                  hitSlop={4}
                  onPress={() => setMenuFor(snapshot)}
                  className={cn(libraryRow.menuButton, "active:border-border-strong active:bg-card")}
                >
                  <Icon name="dots" size={18} color="ink-2" />
                </Pressable>
              </Row>
            );
          })}
        </Section>
      )}

      <GameActionsSheet
        title={menuFor?.info?.title ?? t("unreadable")}
        isOpen={menuFor !== null}
        onClose={() => setMenuFor(null)}
        actions={
          // An unreadable blob can't be decrypted, so it can't be exported.
          menuFor?.info
            ? [
                {
                  key: "export",
                  icon: "download",
                  label: t("export"),
                  onPress: () => {
                    setExportTarget(menuFor);
                    setIsExportOpen(true);
                  },
                },
              ]
            : []
        }
      />
      <SnapshotImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={reload}
      />
      <SnapshotExportDialog isOpen={isExportOpen} snapshot={exportTarget} onClose={() => setIsExportOpen(false)} />
    </ShellContent>
  );
}
