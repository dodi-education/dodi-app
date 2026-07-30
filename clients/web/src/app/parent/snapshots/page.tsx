"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/shared/icon";
import { PageActions, Section } from "@/components/parent/section";
import { DotSep, Row, RowMain, RowMeta, RowTitle } from "@/components/parent/rows";
import { SnapshotExportDialog } from "@/components/parent/snapshots/snapshot-export-dialog";
import { SnapshotImportDialog } from "@/components/parent/snapshots/snapshot-import-dialog";
import { useDateFormat } from "@/components/providers/date-format-provider";
import { useKids } from "@/hooks/use-kids";
import {
  type AccountSnapshot,
  useAccountSnapshots,
} from "@/hooks/use-account-snapshots";
import {
  type SnapshotKidFilter,
  type SnapshotTypeFilter,
  type SnapshotUsageFilter,
  matchesSnapshotFilters,
} from "@/lib/snapshot-filters";

const TYPE_FILTERS: SnapshotTypeFilter[] = ["manual", "autosave"];
const USAGE_FILTERS: SnapshotUsageFilter[] = ["stored", "sent", "received"];

function SnapshotBadge({ snapshot }: { snapshot: AccountSnapshot }) {
  const t = useTranslations("parentSnapshots");
  const { view, senderName, sentToName } = snapshot;

  if (view.origin === "received") {
    return (
      <Badge variant="blue">
        {senderName
          ? t("receivedFrom", { name: senderName })
          : t("receivedFromUnknown")}
      </Badge>
    );
  }
  if (view.sharedWithKidId) {
    return (
      <Badge variant="blue">
        {sentToName ? t("sentTo", { name: sentToName }) : t("sentToUnknown")}
      </Badge>
    );
  }
  return (
    <Badge variant="gray">
      {view.origin === "autosave" ? t("typeAutosave") : t("usageStored")}
    </Badge>
  );
}

export default function ParentSnapshotsPage() {
  const t = useTranslations("parentSnapshots");
  const { formatDateTime } = useDateFormat();

  const { kids: kidList } = useKids();
  const kids = kidList ?? [];
  const { snapshots, friendKids, loading, error, reload } = useAccountSnapshots();

  const [filterKid, setFilterKid] = useState<string>("all");
  const [filterType, setFilterType] = useState<SnapshotTypeFilter>("all");
  const [filterUsage, setFilterUsage] = useState<SnapshotUsageFilter>("all");

  const [importOpen, setImportOpen] = useState(false);
  // The export target stays set while the dialog animates closed, so the
  // content doesn't blank out (game-studio-list pattern).
  const [exportTarget, setExportTarget] = useState<AccountSnapshot | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Siblings can be friends, so an own kid id may also appear on the friend
  // side of rows — resolve which section the selected id came from.
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
  const hasFilters =
    filterKid !== "all" || filterType !== "all" || filterUsage !== "all";

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

  return (
    <div>
      <PageActions>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Icon name="upload" size={16} />
          {t("importSnapshot")}
        </Button>
      </PageActions>

      <SnapshotImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={reload}
      />
      <SnapshotExportDialog
        open={exportOpen}
        snapshot={exportTarget}
        onClose={() => setExportOpen(false)}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Select value={filterKid} onValueChange={setFilterKid}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filterKid")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterKid")}</SelectItem>
            <SelectGroup>
              <SelectLabel>{t("filterKidOwn")}</SelectLabel>
              {kids.map((kid) => (
                <SelectItem key={kid.id} value={kid.id}>
                  {kid.display_name}
                </SelectItem>
              ))}
            </SelectGroup>
            {friendKids.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{t("filterKidOther")}</SelectLabel>
                  {friendKids.map((friend) => (
                    <SelectItem key={friend.id} value={friend.id}>
                      {friend.name ?? t("unknownKid")}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>

        <Select
          value={filterType}
          onValueChange={(v) => setFilterType(v as SnapshotTypeFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filterType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterType")}</SelectItem>
            {TYPE_FILTERS.map((type) => (
              <SelectItem key={type} value={type}>
                {typeLabels[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterUsage}
          onValueChange={(v) => setFilterUsage(v as SnapshotUsageFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("filterUsage")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterUsage")}</SelectItem>
            {USAGE_FILTERS.map((usage) => (
              <SelectItem key={usage} value={usage}>
                {usageLabels[usage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="rounded-lg border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground">
          {error === "locked" ? t("locked") : t("loadFailed")}
        </div>
      ) : filtered.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground">
          {hasFilters ? t("noResults") : t("noSnapshots")}
        </div>
      ) : (
        <Section title={t("heading")}>
          {filtered.map((snapshot) => (
            <Row key={snapshot.view.id}>
              {snapshot.info?.thumbnail ? (
                <Image
                  src={snapshot.info.thumbnail}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized
                  className="size-12 shrink-0 rounded-md border border-border object-cover"
                />
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon name="camera" size={22} stroke={1.6} />
                </div>
              )}
              <RowMain>
                <RowTitle>
                  <span className="line-clamp-1">
                    {snapshot.info?.title ?? t("unreadable")}
                  </span>
                </RowTitle>
                <RowMeta>
                  {snapshot.info?.gameTitle && (
                    <>
                      {snapshot.info.gameTitle}
                      <DotSep />
                    </>
                  )}
                  {snapshot.kidName}
                  <DotSep />
                  {formatDateTime(snapshot.view.createdAt)}
                </RowMeta>
              </RowMain>
              <SnapshotBadge snapshot={snapshot} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("snapshotActions", {
                      title: snapshot.info?.title ?? t("unreadable"),
                    })}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-2 transition-colors outline-none hover:border-border-strong hover:bg-card focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 data-[state=open]:border-border-strong data-[state=open]:bg-card"
                  >
                    <Icon name="dots" size={18} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {/* An unreadable blob can't be decrypted, so it can't be exported. */}
                  <DropdownMenuItem
                    disabled={!snapshot.info}
                    onSelect={() => {
                      setExportTarget(snapshot);
                      setExportOpen(true);
                    }}
                  >
                    <Icon name="download" size={15} />
                    {t("export")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}
