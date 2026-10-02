import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";
import {
  gameFilters,
  gamePlayActions,
  gamePlayNotice,
  gameViewShell,
  kidCard,
  kidLibrary,
  kidLibraryState,
  kidRequiredCard,
  parentSnapshotRow,
  snapshotFlash,
} from "@dodi/ui-recipes";

/**
 * The kid games + snapshots components (components/games/{game-library,
 * game-card,game-view-shell,game-play-view,game-play-page},
 * components/snapshots/*, the (kid) pages and parent/snapshots) take their
 * classes from @dodi/ui-recipes' kid-play.ts, shared with the mobile app.
 * Moving them there must not change the web: each element's final class set
 * must equal the pre-move string pinned below, except for additions that are
 * no-ops in a browser.
 */
const WEB_NO_OPS = new Set([
  // React Native lays out in columns by default and needs the row direction
  // spelled out; on the web these sit on flex containers that are rows already.
  "flex-row",
  // Colors the web already inherits from the global border rule.
  "border-border",
  // RN flex items default to flexShrink 0; flex-shrink: 1 is already the web default.
  "shrink",
]);

const tokens = (classes: string): Set<string> => new Set(cn(classes).split(/\s+/).filter(Boolean));

function expectSameClasses(actual: string, original: string): void {
  const got = tokens(actual);
  const want = tokens(original);
  const missing = [...want].filter((c) => !got.has(c));
  const extra = [...got].filter((c) => !want.has(c) && !WEB_NO_OPS.has(c));
  expect({ missing, extra }).toEqual({ missing: [], extra: [] });
}

const SHADOW = "shadow-[0_2px_10px_rgba(34,56,78,0.05)]";

describe("kid play components keep their classes after moving to @dodi/ui-recipes", () => {
  it("library pages (games + snapshots)", () => {
    const l = kidLibrary;
    expectSameClasses(l.root, "w-full max-w-5xl");
    expectSameClasses(cn(l.webHead, l.head), "flex flex-wrap items-center justify-between gap-3");
    expectSameClasses(l.title, "text-[27px] font-extrabold tracking-tight text-ink");
    expectSameClasses(l.subtitle, "mt-0.5 text-sm font-semibold text-muted-foreground");
    expectSameClasses(
      cn(l.section, l.sectionFirst),
      "mb-3 mt-5 text-[13px] font-extrabold tracking-[0.07em] text-faint uppercase",
    );
    expectSameClasses(
      cn(l.section, l.sectionNext),
      "mb-3 mt-6 text-[13px] font-extrabold tracking-[0.07em] text-faint uppercase",
    );
    expectSameClasses(
      cn(l.webGrid, l.grid),
      "grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]",
    );

    const s = kidLibraryState;
    expectSameClasses(
      cn(s.loading, s.loadingText, s.webLoading),
      `rounded-[20px] bg-white p-6 text-sm font-semibold text-muted-foreground ${SHADOW}`,
    );
    expectSameClasses(
      cn(s.spaced, s.loading, s.loadingText, s.webLoading),
      `mt-6 rounded-[20px] bg-white p-6 text-sm font-semibold text-muted-foreground ${SHADOW}`,
    );
    expectSameClasses(
      cn(s.error, s.errorText),
      "rounded-[20px] bg-danger-soft p-6 text-sm font-semibold text-danger",
    );
    expectSameClasses(
      cn(s.spaced, s.error, s.errorText),
      "mt-6 rounded-[20px] bg-danger-soft p-6 text-sm font-semibold text-danger",
    );
    expectSameClasses(
      cn(s.empty, s.emptyText),
      "rounded-[20px] bg-white/70 p-5 text-sm font-semibold text-muted-foreground",
    );
    expectSameClasses(
      cn(s.spaced, s.empty, s.emptyText),
      "mt-6 rounded-[20px] bg-white/70 p-5 text-sm font-semibold text-muted-foreground",
    );

    const k = kidRequiredCard;
    expectSameClasses(
      cn(k.box, k.web),
      `my-auto w-full max-w-xl rounded-[20px] bg-white p-6 text-center ${SHADOW}`,
    );
    expectSameClasses(k.title, "text-xl font-extrabold text-ink");
    expectSameClasses(k.text, "mt-2 text-sm font-semibold text-muted-foreground");
  });

  it("game filters", () => {
    const f = gameFilters;
    expectSameClasses(cn(f.webRow, f.row), "mt-4 mb-6 flex flex-wrap items-center gap-2");
    expectSameClasses(
      cn(f.webSearch, f.search, f.searchText),
      "flex w-[280px] items-center gap-2 rounded-full bg-white px-4 py-2 text-faint shadow-[inset_0_0_0_1.5px_var(--border)] focus-within:shadow-[inset_0_0_0_2px_var(--color-primary-soft-2)]",
    );
    expectSameClasses(
      cn(f.input, f.webInput),
      "min-w-0 flex-1 border-0 bg-transparent text-sm font-bold text-ink outline-none placeholder:font-semibold placeholder:text-faint",
    );
    expectSameClasses(f.tagChip, "px-2");
    expectSameClasses(f.tagIcon, "size-5");
  });

  it("game + snapshot cards", () => {
    const c = kidCard;
    expectSameClasses(
      cn(c.web, c.box),
      `flex flex-col gap-3 rounded-[20px] bg-white p-[18px] pb-4 ${SHADOW}`,
    );
    expectSameClasses(
      cn(c.webLink, c.link),
      "group flex items-start gap-3.5 rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2",
    );
    expectSameClasses(c.thumb, "size-[100px] shrink-0 rounded-[16px]");
    expectSameClasses(
      cn(c.thumb, c.snapshotThumb, c.webSnapshotThumb),
      "size-[100px] shrink-0 rounded-[16px] border border-border object-cover",
    );
    expectSameClasses(
      cn(c.webTile, c.tile),
      "flex size-[100px] shrink-0 items-center justify-center rounded-[16px]",
    );
    expectSameClasses(
      cn(c.webTile, c.tile, c.snapshotTile, c.snapshotTileText),
      "flex size-[100px] shrink-0 items-center justify-center rounded-[16px] bg-primary-soft text-primary",
    );
    expectSameClasses(c.main, "min-w-0 flex-1");
    expectSameClasses(
      cn(c.title, c.webTitle),
      "text-[16.5px] font-extrabold leading-tight text-ink group-hover:text-primary",
    );
    expectSameClasses(cn(c.webMetaRow, c.metaRow), "mt-0.5 flex items-center gap-1.5");
    expectSameClasses(c.meta, "text-[12.5px] font-bold text-faint");
    expectSameClasses(cn(c.metaLine, c.meta), "mt-0.5 text-[12.5px] font-bold text-faint");
    expectSameClasses(cn(c.webTags, c.tags), "flex items-center gap-1");
    expectSameClasses(
      cn(c.webTag, c.tag),
      "flex size-[18px] items-center justify-center rounded-md",
    );
    expectSameClasses(
      cn(c.description, c.webDescription),
      "mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-muted-foreground",
    );
    expectSameClasses(
      c.description,
      "mt-1.5 text-[13.5px] font-semibold leading-snug text-muted-foreground",
    );
    expectSameClasses(cn(c.webBadges, c.badges), "mt-1.5 flex flex-wrap gap-1.5");
    expectSameClasses(
      cn(c.badge, c.badgeText, c.badgeFriend, c.badgeFriendText),
      "rounded-full bg-primary-soft px-2.5 py-0.5 text-[11.5px] font-extrabold text-primary",
    );
    expectSameClasses(
      cn(c.badge, c.badgeText, c.badgeNew, c.badgeNewText),
      "rounded-full bg-danger-soft px-2.5 py-0.5 text-[11.5px] font-extrabold text-danger",
    );
    expectSameClasses(
      cn(c.webFooter, c.footer),
      "mt-auto flex items-center justify-between gap-2",
    );
    expectSameClasses(
      cn(c.webIconButton, c.iconButton, c.iconButtonText),
      "flex size-11 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:opacity-40",
    );
    expectSameClasses(c.play, "px-6");
  });

  it("game view shell + play actions + notices", () => {
    const g = gameViewShell;
    expectSameClasses(cn(g.webRoot, g.root), "flex w-full flex-col gap-4 pb-4");
    expectSameClasses(
      cn(g.webBar, g.bar),
      "flex min-w-0 items-center gap-3 lg:grid lg:grid-cols-[300px_1fr] lg:gap-4",
    );
    expectSameClasses(cn(g.webBack, g.back), "flex shrink-0");
    expectSameClasses(
      cn(g.webTitleRow, g.titleRow),
      "flex min-w-0 flex-1 items-center justify-between gap-3 lg:max-w-[var(--stage-w)]",
    );
    expectSameClasses(g.titleWrap, "min-w-0");
    expectSameClasses(
      cn(g.webTitle, g.title),
      "truncate text-[17px] font-extrabold text-ink lg:text-[21px]",
    );
    expectSameClasses(cn(g.webCols, g.cols), "grid gap-4 lg:grid-cols-[300px_1fr]");
    expectSameClasses(g.webSide, "hidden lg:block");
    expectSameClasses(g.content, "min-w-0");

    const a = gamePlayActions;
    expectSameClasses(cn(a.webRow, a.row), "flex shrink-0 items-center gap-4");
    expectSameClasses(
      cn(a.photo, a.photoText, a.webPhoto),
      "gap-1.5 rounded-[12px] border border-border-strong bg-white px-3 py-2 text-[13.5px] font-extrabold text-ink-2 shadow-sm hover:bg-primary-soft hover:text-primary",
    );
    expectSameClasses(a.divider, "h-7 w-px shrink-0 self-center bg-border-strong");
    expectSameClasses(
      cn(a.reset, a.resetText, a.webReset),
      "rounded-[12px] border border-danger/30 bg-white text-danger shadow-sm hover:bg-danger-soft",
    );
    expectSameClasses(
      cn(a.error, a.errorText),
      "mb-4 rounded-[14px] bg-danger-soft px-3 py-2 text-xs font-semibold text-danger",
    );

    const n = gamePlayNotice;
    expectSameClasses(
      cn(n.box, n.web),
      "w-full max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm",
    );
    expectSameClasses(n.webIcon, "mx-auto text-muted-foreground");
    expectSameClasses(n.text, "mt-3 text-sm font-semibold text-muted-foreground");
    expectSameClasses(n.title, "text-xl font-bold text-dodi-800");
    expectSameClasses(n.body, "mt-2 text-sm text-muted-foreground");
  });

  it("snapshot flash", () => {
    const f = snapshotFlash;
    expectSameClasses(cn(f.overlay, f.webOverlay), "pointer-events-none fixed inset-0 z-50");
    expectSameClasses(
      cn(f.image, f.webImage),
      "absolute rounded-[16px] border-[3px] border-white object-cover shadow-[0_10px_30px_rgba(34,56,78,0.35)]",
    );
  });

  it("parent snapshots overview", () => {
    const p = parentSnapshotRow;
    expectSameClasses(
      cn(p.thumb, p.webThumb),
      "size-12 shrink-0 rounded-md border border-border object-cover",
    );
    expectSameClasses(
      cn(p.webTile, p.tile, p.tileText),
      "flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary",
    );
    expectSameClasses(cn(p.webFilters, p.filters), "mb-6 flex flex-wrap gap-3");
    expectSameClasses(p.filter, "w-[180px]");
    expectSameClasses(
      cn(p.empty, p.emptyText, p.textAlign),
      "rounded-lg border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground",
    );
  });
});
