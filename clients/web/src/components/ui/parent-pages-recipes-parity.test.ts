import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";
import {
  activityEmpty,
  activityFilters,
  activityRowTitle,
  approvalActions,
  approvalAvatar,
  dossierView,
  kidAvatar,
  kidCrumbSwitcher,
  kidRowLink,
  loadMoreRow,
  memoryEmpty,
  memoryItem,
  memoryTextarea,
  pageMessage,
  personaAvatar,
  pinPuzzleBlock,
  sectionEmpty,
  sectionFormError,
  sectionMessage,
  soulActions,
  soulPreview,
  socialIdRow,
  soulTextarea,
  usageStats,
} from "@dodi/ui-recipes";

/**
 * The parent pages (kids, kid memory, personas, activities, usage) take their
 * classes from @dodi/ui-recipes' parent-pages.ts, shared with the mobile app.
 * Moving them there must not change the web: each element's final class set
 * must equal the pre-move string pinned below, except for additions that are
 * no-ops in a browser.
 */
const WEB_NO_OPS = new Set([
  // React Native lays out in columns by default and needs the row direction
  // spelled out; on the web these sit on flex containers that are rows already.
  "flex-row",
  // Colors the web already inherits from the body / the global border rule.
  "text-foreground",
  "border-border",
]);

const tokens = (classes: string): Set<string> => new Set(cn(classes).split(/\s+/).filter(Boolean));

function expectSameClasses(actual: string, original: string): void {
  const got = tokens(actual);
  const want = tokens(original);
  const missing = [...want].filter((c) => !got.has(c));
  const extra = [...got].filter((c) => !want.has(c) && !WEB_NO_OPS.has(c));
  expect({ missing, extra }).toEqual({ missing: [], extra: [] });
}

describe("parent pages keep their classes after moving to @dodi/ui-recipes", () => {
  it("page and section messages", () => {
    expectSameClasses(cn(pageMessage.web, pageMessage.box), "flex items-center justify-center py-12");
    expectSameClasses(pageMessage.text, "text-muted-foreground");
    expectSameClasses(cn(sectionMessage.box, sectionMessage.text), "px-5 py-12 text-center text-sm text-muted-foreground");
    expectSameClasses(
      cn(sectionMessage.box, sectionMessage.text, sectionMessage.danger),
      "px-5 py-12 text-center text-sm text-danger",
    );
    expectSameClasses(cn(sectionEmpty.web, sectionEmpty.box), "flex flex-col items-center gap-4 px-5 py-12");
    expectSameClasses(sectionEmpty.webIcon, "h-10 w-10 text-primary");
    expectSameClasses(sectionEmpty.text, "text-sm text-muted-foreground");
    expectSameClasses(cn(sectionFormError.box, sectionFormError.text), "px-5 py-3 text-sm text-danger");
    expectSameClasses(sectionFormError.text, "text-sm text-danger");
  });

  it("kids list, approvals and persona rows", () => {
    expectSameClasses(
      cn(kidAvatar.web, kidAvatar.box, kidAvatar.text, "bg-x", "text-y"),
      "flex size-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold bg-x text-y",
    );
    expectSameClasses(cn(kidRowLink.web, kidRowLink.box), "flex min-w-0 flex-1 items-center gap-3.5");
    expectSameClasses(
      cn(approvalAvatar.web, approvalAvatar.box, approvalAvatar.text),
      "flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold text-primary",
    );
    expectSameClasses(cn(approvalActions.web, approvalActions.box), "flex shrink-0 gap-2");
    expectSameClasses(
      cn(personaAvatar.web, personaAvatar.box),
      "flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary",
    );
  });

  it("breadcrumbs: the kid switcher button", () => {
    expectSameClasses(
      cn(kidCrumbSwitcher.webButton, kidCrumbSwitcher.button),
      "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-primary",
    );
    expectSameClasses(cn(kidCrumbSwitcher.open, kidCrumbSwitcher.webOpen), "bg-foreground/5 text-primary");
  });

  it("kid edit: the PIN puzzle block", () => {
    expectSameClasses(pinPuzzleBlock.box, "px-5 py-4");
    expectSameClasses(pinPuzzleBlock.hint, "mb-3 text-[13px] text-muted-foreground");
    expectSameClasses(pinPuzzleBlock.puzzle, "max-w-[320px]");
    expectSameClasses(cn(socialIdRow.web, socialIdRow.box), "flex items-center gap-2");
  });

  it("memory page and dossier", () => {
    expectSameClasses(
      cn(memoryTextarea.web, memoryTextarea.box, memoryTextarea.text),
      "block w-full resize-y rounded-md border border-input bg-card px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none transition-[color,box-shadow,border-color] placeholder:text-faint hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2",
    );
    expectSameClasses(
      cn(memoryEmpty.web, memoryEmpty.box, memoryEmpty.text),
      "whitespace-pre-wrap rounded-md bg-muted p-3.5 text-sm leading-relaxed text-faint",
    );
    expectSameClasses(
      cn(memoryItem.webWithAction, memoryItem.withAction, memoryItem.box),
      "flex items-start justify-between gap-3 px-5 py-3",
    );
    expectSameClasses(memoryItem.main, "min-w-0 flex-1");
    expectSameClasses(memoryItem.content, "text-sm text-ink-2");
    expectSameClasses(memoryItem.meta, "mt-1 text-xs text-faint");
    expectSameClasses(memoryItem.category, "mr-2 font-medium");
    expectSameClasses(memoryItem.box, "px-5 py-3");
    expectSameClasses(memoryItem.discardedContent, "text-sm text-muted-foreground line-through");
    expectSameClasses(
      cn(memoryItem.webDiscardedMeta, memoryItem.discardedMeta, memoryItem.meta),
      "mt-1 flex flex-wrap items-center gap-2 text-xs text-faint",
    );
    expectSameClasses(memoryItem.source, "font-mono text-[10px]");
    expectSameClasses(cn(memoryItem.empty, memoryItem.emptyText), "px-5 py-4 text-sm text-faint");

    expectSameClasses(
      cn(dossierView.web, dossierView.box, dossierView.text),
      "max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3.5 text-sm leading-relaxed text-ink-2",
    );
    expectSameClasses(
      cn(dossierView.webCitation, dossierView.citation),
      "-my-1 mx-px cursor-pointer p-1 align-super text-[10px] font-semibold leading-none text-primary hover:underline",
    );
    expectSameClasses(
      cn(dossierView.webPopover, dossierView.popover, dossierView.popoverSize),
      "absolute left-1/2 top-full z-10 mt-1 block w-64 max-w-[80vw] -translate-x-1/2 whitespace-normal rounded-md border border-border bg-card p-3 text-xs shadow-lg",
    );
    expectSameClasses(cn(dossierView.webBlock, dossierView.popoverMeta), "block font-medium text-faint");
    expectSameClasses(cn(dossierView.webBlock, dossierView.popoverText), "mt-1 block leading-relaxed text-ink-2");
    expectSameClasses(cn(dossierView.webBlock, dossierView.popoverMissing), "block text-faint");
  });

  it("personas: soul preview, editor and actions", () => {
    expectSameClasses(
      cn(soulPreview.web, soulPreview.box, soulPreview.short, soulPreview.text),
      "max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3.5 font-mono text-xs leading-relaxed text-ink-2",
    );
    expectSameClasses(
      cn(soulPreview.web, soulPreview.box, soulPreview.tall, soulPreview.text),
      "max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3.5 font-mono text-xs leading-relaxed text-ink-2",
    );
    expectSameClasses(
      cn(soulTextarea.web, soulTextarea.box, soulTextarea.text),
      "min-h-[320px] w-full resize-y rounded-md border border-border-strong bg-card px-3 py-2.5 font-mono text-xs leading-relaxed transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
    );
    expectSameClasses(cn(soulActions.web, soulActions.box), "flex gap-2");
  });

  it("activities and usage", () => {
    expectSameClasses(cn(activityFilters.web, activityFilters.box), "mb-6 flex flex-wrap gap-3");
    expectSameClasses(activityFilters.trigger, "w-[180px]");
    expectSameClasses(
      cn(activityEmpty.box, activityEmpty.text),
      "rounded-lg border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground",
    );
    expectSameClasses(cn(activityRowTitle.web, activityRowTitle.text), "line-clamp-1 font-medium");
    expectSameClasses(cn(loadMoreRow.web, loadMoreRow.box), "flex justify-center");
    expectSameClasses(usageStats, "mb-8 overflow-hidden rounded-lg border bg-card shadow-card");
  });
});
