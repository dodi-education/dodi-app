import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";
import {
  ageRange,
  audiencePill,
  dialogField,
  exportOption,
  formAlert,
  gamePreview,
  importPreview,
  libraryEmpty,
  libraryLoadMore,
  libraryPill,
  libraryRow,
  publishBadge,
  publishCallout,
  publishDisclosure,
  publishStepper,
  publishWithdraw,
  rejectionReason,
  translationsReview,
} from "@dodi/ui-recipes";

/**
 * The games library components (components/parent/games: lists, dialogs,
 * publish flow, preview) take their classes from @dodi/ui-recipes' library.ts,
 * shared with the mobile app. Moving them there must not change the web: each
 * element's final class set must equal the pre-move string pinned below,
 * except for additions that are no-ops in a browser.
 */
const WEB_NO_OPS = new Set([
  // React Native lays out in columns by default and needs the row direction
  // spelled out; on the web these sit on flex containers that are rows already.
  "flex-row",
  // Colors the web already inherits from the body / the global border rule.
  "text-foreground",
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

describe("games library components keep their classes after moving to @dodi/ui-recipes", () => {
  it("list rows (Your games + Discover)", () => {
    const r = libraryRow;
    expectSameClasses(
      cn(r.web, r.box),
      "flex items-center gap-3 border-b border-border py-3 pl-3 pr-1 last:border-0",
    );
    expectSameClasses(
      cn(r.webLink, r.link),
      "group flex min-w-0 flex-1 items-start gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2",
    );
    expectSameClasses(
      cn(r.webButton, r.button),
      "-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-primary-soft-2",
    );
    expectSameClasses(cn(r.thumb, r.webThumb), "h-15 w-15 shrink-0 rounded-xl object-cover");
    expectSameClasses(
      cn(r.webThumbFallback, r.thumbFallback),
      "flex h-15 w-15 shrink-0 items-center justify-center rounded-xl",
    );
    expectSameClasses(r.main, "min-w-0 flex-1");
    expectSameClasses(cn(r.webTitleRow, r.titleRow), "flex items-center gap-2");
    expectSameClasses(
      cn(r.webTitle, r.title, r.webTitleHover),
      "truncate text-sm font-semibold text-ink-1 transition-colors group-hover:text-primary",
    );
    expectSameClasses(cn(r.webTitle, r.title), "truncate text-sm font-semibold text-ink-1");
    expectSameClasses(cn(r.meta, r.webMeta), "mt-0.5 truncate text-xs text-muted-foreground");
    expectSameClasses(
      cn(r.webStats, r.stats, r.statsText),
      "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground",
    );
    expectSameClasses(cn(r.webStat, r.stat), "inline-flex items-center gap-1");
    expectSameClasses(
      cn(r.webTagTile, r.tagTile),
      "flex size-[18px] shrink-0 items-center justify-center rounded-md",
    );
    expectSameClasses(
      cn(r.webMenuButton, r.menuButton, r.menuButtonText),
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-2 transition-colors outline-none hover:border-border-strong hover:bg-card focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 data-[state=open]:border-border-strong data-[state=open]:bg-card",
    );
    expectSameClasses(
      cn(r.webUnshare, r.unshare, r.unshareText),
      "flex size-9 shrink-0 items-center justify-center rounded-md bg-danger text-white transition-colors outline-none hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-danger/40 disabled:pointer-events-none disabled:opacity-50",
    );
    expectSameClasses(libraryEmpty, "px-1 py-6 text-center text-sm text-muted-foreground");
    expectSameClasses(cn(libraryLoadMore.web, libraryLoadMore.box), "flex justify-center pt-3");
  });

  it("status pills", () => {
    const p = libraryPill;
    expectSameClasses(
      cn(p.box, p.text, p.primary, p.primaryText),
      "shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary",
    );
    expectSameClasses(
      cn(p.webWithIcon, p.withIcon, p.box, p.text, p.primary, p.primaryText),
      "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary",
    );
    expectSameClasses(
      cn(p.box, p.text, p.muted, p.mutedText),
      "shrink-0 rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground",
    );
    expectSameClasses(p.dot, "h-[7px] w-[7px] rounded-full bg-primary");
  });

  it("dialog content: alerts, fields, audience pills, export", () => {
    expectSameClasses(
      cn(formAlert.box, formAlert.text),
      "rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger",
    );
    expectSameClasses(
      cn(formAlert.box, formAlert.confirmText),
      "rounded-lg bg-danger-soft px-3 py-2 text-xs text-ink-2",
    );
    expectSameClasses(cn(dialogField.web, dialogField.box), "flex flex-col gap-1.5");
    expectSameClasses(dialogField.label, "text-xs font-semibold text-ink-2");
    expectSameClasses(dialogField.hint, "text-[11px] text-faint");
    expectSameClasses(dialogField.note, "text-xs text-muted-foreground");

    const a = audiencePill;
    expectSameClasses(cn(a.webRow, a.row), "flex flex-wrap gap-2");
    expectSameClasses(
      cn(a.web, a.box, a.text, cn(a.selected, a.selectedText)),
      "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors border-primary bg-primary-soft text-primary",
    );
    expectSameClasses(
      cn(a.web, a.box, a.text, cn(a.idle, a.idleText, a.webIdle)),
      "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors border-border-strong bg-card text-ink-2 hover:border-faint",
    );
    expectSameClasses(
      cn(a.webInitial, a.initial, a.initialText),
      "flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary",
    );

    expectSameClasses(cn(exportOption.webGroup, exportOption.group), "flex flex-col gap-2");
    expectSameClasses(
      cn(exportOption.web, exportOption.box, exportOption.text),
      "flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2",
    );
  });

  it("import preview", () => {
    const i = importPreview;
    expectSameClasses(cn(i.webBody, i.picker), "flex flex-col gap-3");
    expectSameClasses(cn(i.webBody, i.body), "flex flex-col gap-4");
    expectSameClasses(cn(i.webCard, i.card), "flex gap-3 rounded-xl border border-border bg-card p-3");
    expectSameClasses(cn(i.thumb, i.webThumb), "h-18 w-18 shrink-0 rounded-lg object-cover");
    expectSameClasses(i.main, "min-w-0");
    expectSameClasses(cn(i.webTitle, i.title), "truncate text-sm font-bold text-ink");
    expectSameClasses(
      cn(i.description, i.webDescription),
      "mt-0.5 line-clamp-3 text-xs text-muted-foreground",
    );
    expectSameClasses(i.meta, "mt-1 text-[11px] text-faint");
    expectSameClasses(cn(i.webTags, i.tags), "mt-1.5 flex flex-wrap gap-1");
    expectSameClasses(
      cn(i.webTag, i.tag, i.tagText),
      "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-ink-2",
    );
    expectSameClasses(
      cn(i.webNotes, i.notes, i.notesText),
      "flex flex-col gap-1 text-xs text-muted-foreground",
    );
    expectSameClasses(
      cn(i.another, i.webAnother),
      "w-fit text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-ink-2",
    );
  });

  it("publish dialog: badge, callouts, disclosure, withdraw", () => {
    const b = publishBadge;
    expectSameClasses(
      cn(b.box, b.text, cn(b.published, b.publishedText)),
      "rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary",
    );
    expectSameClasses(
      cn(b.box, b.text, cn(b.rejected, b.rejectedText)),
      "rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger",
    );
    expectSameClasses(
      cn(b.box, b.text, cn(b.pending, b.pendingText)),
      "rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning",
    );

    const c = publishCallout;
    expectSameClasses(cn(c.webStack, c.stack), "flex flex-col gap-3");
    expectSameClasses(
      cn(c.web, c.box, c.success, c.text),
      "flex gap-2.5 rounded-lg bg-success-soft px-3 py-2.5 text-xs",
    );
    expectSameClasses(
      cn(c.web, c.box, c.warning, c.text),
      "flex gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-xs",
    );
    expectSameClasses(
      cn(c.web, c.compact, c.warning, c.text, c.bodyText),
      "flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-ink-2",
    );
    expectSameClasses(
      cn(c.web, c.compact, c.info, c.text, c.bodyText),
      "flex gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-ink-2",
    );
    expectSameClasses(cn(c.webBody, c.body), "flex flex-col gap-2");
    expectSameClasses(cn(c.webBody, c.bodyTight), "flex flex-col gap-1");
    expectSameClasses(cn(c.webBody, c.bodyTight, c.bodyText), "flex flex-col gap-1 text-ink-2");
    expectSameClasses(
      cn(c.webLink, c.link, c.linkText),
      "inline-flex items-center gap-1 font-semibold text-primary hover:underline",
    );

    const d = publishDisclosure;
    expectSameClasses(cn(d.webRoot, d.root), "group rounded-lg border border-border px-3");
    expectSameClasses(
      cn(d.webSummary, d.summary, d.summaryText),
      "flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-ink-2 [&::-webkit-details-marker]:hidden",
    );
    expectSameClasses(cn(d.webBody, d.body), "flex flex-col items-start gap-2.5 pb-3");

    expectSameClasses(
      cn(publishWithdraw.text, publishWithdraw.web),
      "text-danger hover:bg-danger-soft hover:text-danger sm:mr-auto",
    );
  });

  it("publish stepper", () => {
    const s = publishStepper;
    expectSameClasses(cn(s.webList, s.list), "flex items-start");
    expectSameClasses(
      cn(s.webItem, s.item),
      "relative flex flex-1 flex-col items-center gap-1.5 text-center",
    );
    expectSameClasses(
      cn(s.line, s.webLine, s.lineDone),
      "absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 bg-primary",
    );
    expectSameClasses(
      cn(s.line, s.webLine, s.lineUpcoming),
      "absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 bg-muted",
    );
    const dot = "relative z-10 flex size-7 items-center justify-center rounded-full text-xs font-bold";
    expectSameClasses(cn(s.webDot, s.dot, s.dotText, s.done, s.doneText), `${dot} bg-primary text-primary-foreground`);
    expectSameClasses(
      cn(s.webDot, s.dot, s.dotText, s.current, s.currentText, s.webCurrentRing),
      `${dot} bg-warning-soft text-warning ring-2 ring-warning`,
    );
    expectSameClasses(
      cn(s.webDot, s.dot, s.dotText, s.danger, s.dangerText, s.webDangerRing),
      `${dot} bg-danger-soft text-danger ring-2 ring-danger`,
    );
    expectSameClasses(cn(s.webDot, s.dot, s.dotText, s.upcoming, s.upcomingText), `${dot} bg-muted text-faint`);
    expectSameClasses(cn(s.label, s.labelDone), "text-[11px] font-semibold text-ink-2");
    expectSameClasses(cn(s.label, s.labelUpcoming), "text-[11px] font-semibold text-faint");
  });

  it("rejection reasons, translations review, age range", () => {
    const r = rejectionReason;
    expectSameClasses(cn(r.webList, r.list), "flex flex-col gap-2");
    expectSameClasses(cn(r.box, r.permanent, r.text), "rounded-lg bg-danger-soft px-3 py-2 text-xs");
    expectSameClasses(cn(r.box, r.fixable, r.text), "rounded-lg bg-warning-soft px-3 py-2 text-xs");
    expectSameClasses(cn(r.title, r.titlePermanent), "font-semibold text-danger");
    expectSameClasses(cn(r.title, r.titleFixable), "font-semibold text-warning");
    expectSameClasses(r.note, "mt-0.5 text-muted-foreground");

    const t = translationsReview;
    expectSameClasses(cn(t.webRoot, t.root), "flex max-h-[50vh] flex-col gap-3 overflow-y-auto");
    expectSameClasses(cn(t.webField, t.field), "flex flex-col gap-1.5");
    expectSameClasses(t.locale, "text-xs font-semibold uppercase text-ink-2");
    expectSameClasses(t.sourceTag, "ml-1.5 normal-case text-faint");
    expectSameClasses(
      cn(t.textarea, t.textareaText, t.webTextarea, t.flagged),
      "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 border-warning",
    );

    expectSameClasses(cn(ageRange.webRow, ageRange.row), "flex items-center gap-2.5");
    expectSameClasses(cn(ageRange.field, ageRange.invalid), "w-16 text-center border-destructive");
    expectSameClasses(ageRange.dash, "text-sm font-medium text-muted-foreground");
  });

  it("published game preview", () => {
    const g = gamePreview;
    expectSameClasses(
      cn(g.webHeader, g.header),
      "flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 md:px-5",
    );
    expectSameClasses(
      cn(g.webSegments, g.segments),
      "inline-flex gap-0.5 rounded-[10px] border border-border bg-background p-[3px]",
    );
    const seg =
      "inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[13px] font-semibold transition-colors";
    expectSameClasses(
      cn(g.webSegment, g.segment, g.segmentText, cn(g.segmentActive, g.segmentActiveText, g.webSegmentActive)),
      `${seg} bg-card text-ink shadow-[0_1px_2px_rgba(34,56,78,0.06)]`,
    );
    expectSameClasses(
      cn(g.webSegment, g.segment, g.segmentText, cn(g.segmentIdleText, g.webSegmentIdle)),
      `${seg} text-muted-foreground hover:text-ink-2`,
    );
    expectSameClasses(cn(g.webHeaderActions, g.headerActions), "flex items-center gap-2.5");
    expectSameClasses(cn(g.webStage, g.stage), "flex min-h-full items-center justify-center p-5 md:p-8");
    expectSameClasses(cn(g.webInfos, g.infos), "mx-auto flex max-w-[560px] flex-col gap-6 p-5 md:p-8");
    expectSameClasses(cn(g.webInfoRow, g.infoRow), "flex flex-col gap-1.5");
    expectSameClasses(g.infoLabel, "text-xs font-semibold text-ink-2");
    expectSameClasses(cn(g.infoText, g.infoLongText), "text-sm leading-relaxed text-ink");
    expectSameClasses(g.infoText, "text-sm text-ink");
    expectSameClasses(g.infoEmpty, "text-sm text-muted-foreground");
    expectSameClasses(cn(g.webTags, g.tags), "flex flex-wrap gap-2");
    expectSameClasses(
      cn(g.webTagChip, g.tagChip, g.tagChipText),
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
    );
  });
});
