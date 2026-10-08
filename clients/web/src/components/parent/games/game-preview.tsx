"use client";

/**
 * Read-only parent preview of a PUBLISHED game at `/parent/games/{id}` — a
 * stripped-down Game Studio: the same Preview / Code / Infos stage without the
 * AI-agent chat sidebar, editing, saving or version history. Everything shown is
 * plaintext (publication rows are a voluntary disclosure), so there is no vault
 * decryption step — the caller hands us a `DiscoverGameDetail`.
 *
 * - Preview: plays the game in the shared sandbox stage.
 * - Code: the bundle in a read-only viewer whose only action is Copy.
 * - Infos: the Settings tab reduced to read-only Learning goal / Tags /
 *   Recommended age (text, not inputs).
 *
 * In place of the studio's active/inactive switch, the header offers
 * "Share with kids" (play-in-place — the same flow as the Discover list).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { GameStage } from "@/components/games/game-stage";
import { CodeViewer } from "@/components/parent/games/code-viewer";
import {
  DiscoverShareDialog,
  type ShareableGame,
} from "@/components/parent/games/discover-share-dialog";
import { tagStyle } from "@/components/parent/games/tag-style";
import { Icon, type IconName } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { useTagLabel } from "@/lib/games/tag-label";
import { STAGE } from "@/lib/games/stage";
import { cn } from "@/lib/utils";
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";
import { isSharingAdded } from "@dodi/client-state/game-sharing";
import { gamePreview } from "@dodi/ui-recipes";
import type { DiscoverGameDetail, GameSharingState } from "@dodi/types/games";

type PreviewView = "infos" | "code" | "preview";

interface GamePreviewProps {
  detail: DiscoverGameDetail;
  /** THIS family's current audience for the game — seeds the share dialog. */
  sharing: GameSharingState;
}

export function GamePreview({
  detail,
  sharing: initialSharing,
}: GamePreviewProps) {
  const t = useTranslations("gameStudio");
  const tReport = useTranslations("report");
  const locale = useLocale();
  const [view, setView] = useState<PreviewView>("preview");
  const [shareOpen, setShareOpen] = useState(false);
  // Kept locally so a save in the dialog updates the "Added" chip and re-seeds
  // the pills on the next open.
  const [sharing, setSharing] = useState<GameSharingState>(initialSharing);

  // Publish the game title as the breadcrumb leaf (the URL only has the id), so
  // the top bar reads "Games › {title}" — mirrors the studio.
  const setLeaf = useBreadcrumbStore((s) => s.setLeaf);
  useEffect(() => {
    setLeaf(detail.title.trim() || null);
    return () => setLeaf(null);
  }, [detail.title, setLeaf]);

  const added = isSharingAdded(sharing);
  const shareTarget: ShareableGame = {
    id: detail.id,
    title: detail.title,
    sharing,
  };

  return (
    <div
      className="fixed inset-x-0 top-[60px] bottom-0 z-30 flex flex-col border-t border-border bg-background wide:top-[72px] wide:left-56"
      data-screen-label="Parent — Preview game"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        {/* Header — tab switch on the left, Share with kids on the right
            (replacing the studio's active/inactive toggle). */}
        <div className={cn(gamePreview.webHeader, gamePreview.header)}>
          <div className={cn(gamePreview.webSegments, gamePreview.segments)}>
            <SegTab
              active={view === "infos"}
              onClick={() => setView("infos")}
              icon="info"
              label={t("infos")}
            />
            <SegTab
              active={view === "code"}
              onClick={() => setView("code")}
              icon="code"
              label={t("code")}
            />
            <SegTab
              active={view === "preview"}
              onClick={() => setView("preview")}
              icon="show"
              label={t("preview")}
            />
          </div>
          <div className={cn(gamePreview.webHeaderActions, gamePreview.headerActions)}>
            {added && (
              <span className="hidden items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary sm:inline-flex">
                <Icon name="check" size={11} strokeWidth={3} />
                {t("discoverAdded")}
              </span>
            )}
            <Button size="sm" onClick={() => setShareOpen(true)}>
              <Icon name="user_share" size={15} />
              {t("discoverShare")}
            </Button>
          </div>
        </div>

        {/* Stage */}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
          {/* Keep the sandbox mounted across tab switches (hidden by CSS on the
              other tabs) so returning to Preview doesn't reload the game. */}
          {detail.code_bundle && (
            <div
              aria-hidden={view !== "preview" || undefined}
              className={cn(
                cn(gamePreview.webStage, gamePreview.stage),
                view !== "preview" &&
                  "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden",
              )}
            >
              <GameStage
                gameId={detail.id}
                codeBundle={detail.code_bundle}
                locale={locale}
                reserved={STAGE.reservedStudio}
              />
            </div>
          )}

          {view === "code" && (
            <CodeViewer
              code={detail.code_bundle}
              copyLabel={t("copy")}
              copiedLabel={t("copied")}
            />
          )}

          {view === "infos" && (
            <div className={cn(gamePreview.webInfos, gamePreview.infos)}>
              <InfoRow label={t("learningGoal")}>
                {detail.learning_goal ? (
                  <p className={cn(gamePreview.infoText, gamePreview.infoLongText)}>
                    {detail.learning_goal}
                  </p>
                ) : (
                  <EmptyValue />
                )}
              </InfoRow>

              <InfoRow label={t("tags")}>
                {detail.tags.length > 0 ? (
                  <div className={cn(gamePreview.webTags, gamePreview.tags)}>
                    {detail.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                  </div>
                ) : (
                  <EmptyValue />
                )}
              </InfoRow>

              <InfoRow label={t("recommendedAge")}>
                <p className={gamePreview.infoText}>
                  {detail.target_age_min}–{detail.target_age_max}
                </p>
              </InfoRow>

              <Link
                href={`/parent/report?kind=discover_game&game=${detail.id}`}
                className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-muted-foreground hover:text-danger hover:underline"
              >
                <Icon name="alert" size={14} />
                {tReport("reportGame")}
              </Link>
            </div>
          )}
        </div>
      </div>

      <DiscoverShareDialog
        open={shareOpen}
        game={shareTarget}
        onClose={() => setShareOpen(false)}
        onSaved={setSharing}
      />
    </div>
  );
}

/** Stage switch pill — visual twin of the studio's SegTab. */
function SegTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        gamePreview.webSegment,
        gamePreview.segment,
        gamePreview.segmentText,
        active
          ? cn(gamePreview.segmentActive, gamePreview.segmentActiveText, gamePreview.webSegmentActive)
          : cn(gamePreview.segmentIdleText, gamePreview.webSegmentIdle),
      )}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

/** A read-only label + value block on the Infos tab. */
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(gamePreview.webInfoRow, gamePreview.infoRow)}>
      <span className={gamePreview.infoLabel}>{label}</span>
      {children}
    </div>
  );
}

/** One read-only tag pill (visual twin of the Discover list's tag chip). */
function TagChip({ tag }: { tag: string }) {
  const tagLabel = useTagLabel();
  const s = tagStyle(tag);
  return (
    <span
      className={cn(gamePreview.webTagChip, gamePreview.tagChip, gamePreview.tagChipText)}
      style={{ background: s.bg, color: s.fg }}
    >
      <Icon name={s.icon} size={13} />
      {tagLabel(tag)}
    </span>
  );
}

function EmptyValue() {
  return <p className={gamePreview.infoEmpty}>—</p>;
}
