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
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

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

  const added = sharing.family || sharing.kidIds.length > 0;
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
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 md:px-5">
          <div className="inline-flex gap-0.5 rounded-[10px] border border-border bg-background p-[3px]">
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
          <div className="flex items-center gap-2.5">
            {added && (
              <span className="hidden items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary sm:inline-flex">
                <Icon name="check" size={11} strokeWidth={3} />
                {t("discoverAdded")}
              </span>
            )}
            <Button size="sm" onClick={() => setShareOpen(true)}>
              <Icon name="share" size={15} />
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
                "flex min-h-full items-center justify-center p-5 md:p-8",
                view !== "preview" &&
                  "pointer-events-none invisible absolute inset-0 -z-10 overflow-hidden",
              )}
            >
              <GameStage
                gameId={detail.id}
                codeBundle={detail.code_bundle}
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
            <div className="mx-auto flex max-w-[560px] flex-col gap-6 p-5 md:p-8">
              <InfoRow label={t("learningGoal")}>
                {detail.learning_goal ? (
                  <p className="text-sm leading-relaxed text-ink">
                    {detail.learning_goal}
                  </p>
                ) : (
                  <EmptyValue />
                )}
              </InfoRow>

              <InfoRow label={t("tags")}>
                {detail.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {detail.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                  </div>
                ) : (
                  <EmptyValue />
                )}
              </InfoRow>

              <InfoRow label={t("recommendedAge")}>
                <p className="text-sm text-ink">
                  {detail.target_age_min}–{detail.target_age_max}
                </p>
              </InfoRow>
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
        "inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[13px] font-semibold transition-colors",
        active
          ? "bg-card text-ink shadow-[0_1px_2px_rgba(34,56,78,0.06)]"
          : "text-muted-foreground hover:text-ink-2",
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
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
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
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      <Icon name={s.icon} size={13} />
      {tagLabel(tag)}
    </span>
  );
}

function EmptyValue() {
  return <p className="text-sm text-muted-foreground">—</p>;
}
