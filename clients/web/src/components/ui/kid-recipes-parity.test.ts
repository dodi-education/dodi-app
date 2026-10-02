import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";
import {
  addFriend,
  companionCompact,
  companionVolume,
  listeningPulse,
  friendProfile,
  friendRow,
  friendsCentered,
  friendsList,
  friendsNoKid,
  kidButton,
  kidChrome,
  kidGateHint,
  kidHomeEmpty,
  kidLoadingStage,
  kidNav,
  kidSwitcher,
  pinPuzzle,
  qrCode,
  qrScanner,
  speechBubble,
} from "@dodi/ui-recipes";

import { kidButtonVariants } from "@/components/kid/kid-button";

/**
 * The kid view (components/kid: chrome, switcher, PIN puzzle, KidButton,
 * friends) takes its classes from @dodi/ui-recipes' kid.ts, shared with the
 * mobile app. Moving them there must not change the web: each element's
 * final class set must equal the pre-move string pinned below, except for
 * additions that are no-ops in a browser.
 */
const WEB_NO_OPS = new Set([
  // React Native lays out in columns by default and needs the row direction
  // spelled out; on the web these sit on flex containers that are rows already.
  "flex-row",
  // The web's global border rule already colors borders.
  "border-border",
  // The app wraps tile rows where the web uses a CSS grid; flex-wrap has no
  // effect on a grid container.
  "flex-wrap",
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

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-extrabold transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

describe("kid components keep their classes after moving to @dodi/ui-recipes", () => {
  it("KidButton variants and sizes", () => {
    const variants = {
      play: "bg-primary text-white shadow-[0_3px_10px_rgba(47,107,216,0.28)] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:bg-primary-hover hover:-translate-y-px active:scale-95",
      ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-ink",
      icon: "size-[38px] bg-transparent p-0 text-faint hover:bg-danger-soft hover:text-danger",
      chip: "bg-white/65 text-muted-foreground hover:bg-white data-[active=true]:bg-ink data-[active=true]:text-white",
      back: "bg-white/70 text-muted-foreground hover:bg-white hover:text-ink",
    } as const;
    const sizes = {
      default: "px-6 py-2.5 text-[14.5px] [&_svg:not([class*='size-'])]:size-4",
      sm: "px-4 py-2 text-[13.5px] [&_svg:not([class*='size-'])]:size-3.5",
      lg: "px-7 py-3 text-[15px] [&_svg:not([class*='size-'])]:size-[17px]",
      none: "",
    } as const;
    for (const [variant, v] of Object.entries(variants)) {
      for (const [size, z] of Object.entries(sizes)) {
        expectSameClasses(
          kidButtonVariants({ variant: variant as keyof typeof variants, size: size as keyof typeof sizes }),
          cn(BUTTON_BASE, v, z),
        );
      }
    }
    expectSameClasses(kidButtonVariants(), cn(BUTTON_BASE, variants.play, sizes.default));
    expectSameClasses(
      kidButtonVariants({ variant: "back", size: "sm", className: "pl-3" }),
      cn(BUTTON_BASE, variants.back, sizes.sm, "pl-3"),
    );
    expect(kidButton.activeBox).toBe("bg-ink");
  });

  it("chrome: header, Parent link, main, bottom nav, gates", () => {
    expectSameClasses(kidChrome.webRoot, "flex min-h-screen flex-col font-kid");
    expectSameClasses(
      cn(kidChrome.header, kidChrome.webHeader),
      "flex items-center justify-between px-4 py-3 md:px-6 md:py-4",
    );
    expectSameClasses(cn(kidChrome.headerLeft, kidChrome.webHeaderLeft), "flex min-w-0 items-center gap-3");
    expectSameClasses(
      cn(kidChrome.parentLink, kidChrome.parentLinkText, kidChrome.webParentLink),
      "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-bold text-faint transition-colors hover:text-muted-foreground",
    );
    expectSameClasses(cn(kidChrome.main, kidChrome.webMain), "flex flex-1 flex-col items-center px-4 pb-24");
    expectSameClasses(cn(kidChrome.mainFull, kidChrome.webMainFull), "flex flex-1 flex-col px-4 pb-24");
    expectSameClasses(kidChrome.mainFullInner, "mx-auto w-full max-w-6xl");
    expectSameClasses(
      cn(kidNav.box, kidNav.web),
      "fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 border-t bg-white/85 px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md",
    );
    const item =
      "flex min-w-[88px] flex-col items-center gap-1 rounded-2xl px-5 py-2 text-[13.5px] font-extrabold transition-colors sm:min-w-[110px]";
    expectSameClasses(
      cn(kidNav.item, kidNav.itemText, kidNav.webItem, kidNav.activeItem, kidNav.activeText),
      cn(item, "bg-primary-soft text-primary"),
    );
    expectSameClasses(
      cn(kidNav.item, kidNav.itemText, kidNav.webItem, kidNav.inactiveText, kidNav.webInactive),
      cn(item, "text-faint hover:text-muted-foreground"),
    );
    expectSameClasses(cn(kidLoadingStage.root, kidLoadingStage.webRoot), "my-auto flex flex-col items-center gap-6");
    expectSameClasses(
      cn(kidLoadingStage.circle, kidLoadingStage.webPulse),
      "h-40 w-40 animate-pulse rounded-full bg-dodi-100",
    );
    expectSameClasses(cn(kidLoadingStage.bar, kidLoadingStage.webPulse), "h-6 w-32 animate-pulse rounded-lg bg-dodi-100");
    expectSameClasses(cn(kidGateHint.root, kidGateHint.webRoot), "my-auto flex flex-col items-center gap-4 text-center");
    expectSameClasses(kidGateHint.avatarWrap, "relative opacity-70");
    expectSameClasses(
      cn(kidGateHint.lockBadge, kidGateHint.lockBadgeText, kidGateHint.webLockBadge),
      "absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full bg-white text-faint shadow",
    );
    expectSameClasses(kidGateHint.text, "max-w-[16rem] text-sm font-bold text-muted-foreground");
  });

  it("kid switcher: pill, popover, rows, look editor", () => {
    const s = kidSwitcher;
    expectSameClasses(s.empty, "h-10 w-10 rounded-full bg-primary-soft-2");
    expectSameClasses(
      cn(s.pill, s.pillText, s.webPill),
      "flex items-center gap-2.5 rounded-full bg-white/70 py-1.5 pl-1.5 pr-4 text-[15px] font-extrabold text-ink transition hover:bg-white",
    );
    expectSameClasses(s.pillAvatarEmpty, "size-[34px] rounded-full bg-primary-soft-2");
    expectSameClasses(cn(s.pillName, s.webPillName), "max-w-[120px] truncate");
    expectSameClasses(
      cn(s.popover, s.webPopover),
      "absolute left-0 top-full z-50 mt-2.5 w-[400px] max-w-[calc(100vw-2rem)] rounded-[22px] bg-white p-4 shadow-[0_20px_56px_rgba(34,56,78,0.24)]",
    );
    expectSameClasses(cn(s.head, s.webHead), "mb-2.5 flex items-center justify-between");
    expectSameClasses(s.label, "text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-faint");
    expectSameClasses(
      cn(s.close, s.closeText, s.webClose),
      "flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-border hover:text-ink",
    );
    expectSameClasses(cn(s.list, s.webList), "flex flex-col gap-1");
    const row =
      "flex w-full items-center gap-3 rounded-2xl px-2.5 py-[7px] text-left transition-colors hover:bg-muted";
    expectSameClasses(cn(s.row, s.webRow), row);
    expectSameClasses(cn(s.row, s.webRow, s.rowActive), cn(row, "bg-primary-soft"));
    expectSameClasses(cn(s.row, s.webRow, s.rowPending), cn(row, "bg-muted"));
    expectSameClasses(s.rowName, "flex-1 text-base font-extrabold text-ink");
    expectSameClasses(s.divider, "my-3 h-px bg-border");
    expectSameClasses(cn(s.puzzleHead, s.webPuzzleHead), "mb-1 flex items-center justify-between");
    expectSameClasses(
      cn(s.cancel, s.cancelText, s.webCancel),
      "rounded-[9px] px-2 py-1 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-ink",
    );
    expectSameClasses(s.hint, "mb-4 text-[13px] font-semibold text-muted-foreground");
    expectSameClasses(cn(s.lookHead, s.webLookHead), "mb-3 flex items-center gap-3.5");
    expectSameClasses(s.lookHint, "mt-[3px] text-[13px] font-semibold text-muted-foreground");
    expectSameClasses(cn(s.colors, s.webColors), "mb-3.5 flex gap-2.5");
    expectSameClasses(
      cn(s.color, s.webColor),
      "flex size-[34px] items-center justify-center rounded-full outline-[2.5px] outline-offset-2 transition hover:scale-110",
    );
    expectSameClasses(cn(s.colorDot, s.webColorDot), "rounded-full transition-transform");
    expectSameClasses(cn(s.grid, s.webGrid), "-mx-1 max-h-[244px] overflow-y-auto px-1");
    expectSameClasses(
      cn(s.groupLabel, s.webGroupLabel),
      "mx-0.5 mb-2 mt-3 text-[12px] font-extrabold uppercase tracking-[0.05em] text-faint first:mt-0.5",
    );
    expectSameClasses(cn(s.gridRow, s.webGridRow), "grid grid-cols-6 gap-2");
    expectSameClasses(
      cn(s.tile, s.webTile),
      "relative aspect-square overflow-hidden rounded-[16px] p-1 outline-[2.5px] -outline-offset-[2.5px] transition hover:-translate-y-0.5",
    );
    expectSameClasses(cn(s.tileImage, s.webTileImage), "h-full w-full rounded-[11px] object-contain");
    expectSameClasses(
      cn(s.tileCheck, s.tileCheckText, s.webTileCheck),
      "absolute bottom-[3px] right-[3px] flex size-[18px] items-center justify-center rounded-full text-white shadow",
    );
  });

  it("avatar PIN puzzle", () => {
    const p = pinPuzzle;
    expectSameClasses(cn(p.slots, p.webSlots, p.webShake), "mb-[18px] flex justify-center gap-3.5 animate-pin-shake");
    const slot =
      "flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-[18px] border-[2.5px] transition-colors";
    expectSameClasses(cn(p.slot, p.webSlot, p.slotFilled), cn(slot, "border-solid border-primary bg-white"));
    expectSameClasses(cn(p.slot, p.webSlot, p.slotActive), cn(slot, "border-solid border-primary bg-primary-soft"));
    expectSameClasses(cn(p.slot, p.webSlot, p.slotEmpty), cn(slot, "border-dashed border-border bg-muted"));
    expectSameClasses(cn(p.slotImage, p.webSlotImage), "h-full w-full object-contain p-[5px]");
    expectSameClasses(cn(p.dot, p.dotActive), "h-3 w-3 rounded-full bg-primary");
    expectSameClasses(cn(p.dot, p.dotIdle), "h-3 w-3 rounded-full bg-border");
    expectSameClasses(cn(p.palette, p.webPalette), "grid grid-cols-4 gap-2.5");
    expectSameClasses(
      cn(p.tile, p.webTile),
      "aspect-square overflow-hidden rounded-[14px] bg-muted p-[5px] transition hover:-translate-y-0.5 hover:bg-primary-soft",
    );
    expectSameClasses(cn(p.tileImage, p.webTileImage), "h-full w-full object-contain");
  });

  it("home: empty state and speech bubble", () => {
    expectSameClasses(
      cn(kidHomeEmpty.box, kidHomeEmpty.web),
      "my-auto w-full max-w-xs rounded-[20px] bg-white p-5 text-center shadow-[0_2px_10px_rgba(34,56,78,0.05)]",
    );
    expectSameClasses(kidHomeEmpty.text, "text-sm font-bold text-muted-foreground");
    expectSameClasses(
      cn(speechBubble.box, speechBubble.text, speechBubble.web),
      "relative rounded-[18px] bg-white px-7 py-3 font-bold text-ink-2 shadow-[0_4px_16px_rgba(34,56,78,0.08)]",
    );
    expectSameClasses(
      cn(speechBubble.tail, speechBubble.webTail),
      "absolute -top-[7px] left-1/2 size-3.5 -translate-x-1/2 rotate-45 rounded-[3px] bg-white",
    );
  });

  it("friends: centered states, list, rows", () => {
    expectSameClasses(
      cn(friendsCentered.box, friendsCentered.text, friendsCentered.textAlign, friendsCentered.web),
      "flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-sm font-semibold text-muted-foreground",
    );
    expectSameClasses(
      cn(friendsNoKid.root, friendsNoKid.webRoot),
      "my-auto flex flex-col items-center gap-3 py-8 text-center",
    );
    expectSameClasses(friendsNoKid.text, "text-sm font-semibold text-muted-foreground");
    const l = friendsList;
    expectSameClasses(l.root, "mx-auto w-full max-w-5xl pb-8");
    expectSameClasses(cn(l.head, l.webHead), "mb-4 flex items-center justify-between gap-4");
    expectSameClasses(l.title, "text-[27px] font-extrabold tracking-tight text-ink");
    expectSameClasses(l.count, "mt-0.5 text-sm font-semibold text-muted-foreground");
    expectSameClasses(cn(l.filters, l.webFilters), "mb-6 flex flex-wrap items-center gap-2");
    expectSameClasses(
      cn(l.search, l.searchText, l.webSearch),
      "flex w-[280px] items-center gap-2.5 rounded-full bg-white px-[18px] py-[9px] text-faint shadow-[inset_0_0_0_1.5px_var(--color-border)] focus-within:shadow-[inset_0_0_0_2px_var(--color-primary-soft-2)]",
    );
    expectSameClasses(
      cn(l.searchInput, l.webSearchInput),
      "min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:font-semibold placeholder:text-faint",
    );
    const count = "ml-1 inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-extrabold";
    expectSameClasses(cn(l.chipCount, l.chipCountText, l.webChipCount, l.chipCountActive), cn(count, "bg-white/30 text-white"));
    expectSameClasses(cn(l.chipCount, l.chipCountText, l.webChipCount, l.chipCountIdle), cn(count, "bg-border-strong text-white"));
    expectSameClasses(
      cn(l.sectionLabel, l.webSectionLabel),
      "mb-2.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[0.06em] text-faint first:mt-1",
    );
    expectSameClasses(cn(l.rows, l.webRows), "flex flex-col gap-2.5");
    expectSameClasses(cn(l.empty, l.webEmpty), "flex flex-col items-center gap-3.5 px-5 py-14 text-center");
    expectSameClasses(
      cn(l.emptyIcon, l.emptyIconText, l.webEmptyIcon),
      "flex size-[72px] items-center justify-center rounded-full bg-primary-soft text-primary",
    );
    expectSameClasses(l.emptyText, "max-w-[300px] text-[15.5px] font-bold leading-relaxed text-muted-foreground");

    const r = friendRow;
    const base =
      "flex w-full items-center gap-3.5 rounded-[18px] bg-white px-4 py-3 text-left shadow-[0_2px_10px_rgba(34,56,78,0.05)]";
    expectSameClasses(
      cn(r.box, r.web, r.webOpen),
      cn(
        base,
        "transition-all duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(34,56,78,0.1)] active:scale-[0.985]",
      ),
    );
    expectSameClasses(cn(r.box, r.web, r.webIncoming), cn(base, "outline outline-[1.5px] outline-primary-soft-2"));
    expectSameClasses(cn(r.box, r.web, r.blocked), cn(base, "opacity-90"));
    expectSameClasses(r.main, "min-w-0 flex-1");
    expectSameClasses(r.name, "text-[16.5px] font-extrabold text-ink");
    expectSameClasses(r.nameSuffix, "font-bold text-faint");
    expectSameClasses(cn(r.status, r.statusRequest, r.webStatus), "truncate text-[13px] font-bold text-primary");
    expectSameClasses(cn(r.status, r.statusMuted, r.webStatus), "truncate text-[13px] font-bold text-faint");
    expectSameClasses(cn(r.actions, r.webActions), "flex shrink-0 items-center gap-2");
    expectSameClasses(
      cn(r.decline, r.declineText, r.webDecline),
      "flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50",
    );
    expectSameClasses(
      cn(r.accept, r.acceptText, r.webAccept),
      "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_3px_9px_rgba(47,107,216,0.26)] transition-colors hover:bg-primary-hover active:scale-95 disabled:opacity-50",
    );
    expectSameClasses(
      cn(r.waiting, r.waitingText, r.webWaiting),
      "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-[7px] text-[13px] font-extrabold text-muted-foreground",
    );
    expectSameClasses(
      cn(r.unblock, r.unblockText, r.webUnblock),
      "rounded-full bg-muted px-[18px] py-2.5 text-sm font-extrabold text-ink-2 transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-50",
    );
  });

  it("friends: profile", () => {
    const p = friendProfile;
    expectSameClasses(p.root, "mx-auto w-full max-w-[460px] px-5 pb-8");
    expectSameClasses(
      cn(p.card, p.webCard),
      "mt-1.5 flex flex-col items-center rounded-[26px] bg-white px-6 pb-7 pt-8 shadow-[0_4px_18px_rgba(34,56,78,0.06)]",
    );
    expectSameClasses(p.name, "mt-4 text-[26px] font-extrabold tracking-tight text-ink");
    expectSameClasses(p.nickname, "mt-0.5 text-[15px] font-bold text-faint");
    expectSameClasses(
      cn(p.badge, p.badgeText, p.webBadge),
      "mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-[12.5px] font-extrabold text-success",
    );
    expectSameClasses(p.facts, "mt-6 w-full overflow-hidden rounded-[18px] bg-muted");
    expectSameClasses(cn(p.fact, p.webFact), "flex items-center gap-3 px-[18px] py-[15px]");
    expectSameClasses(
      cn(p.fact, p.webFact, p.factDivider),
      "flex items-center gap-3 border-t border-border px-[18px] py-[15px]",
    );
    expectSameClasses(cn(p.factIcon, p.webFactIcon), "flex shrink-0 text-faint");
    expectSameClasses(p.factLabel, "text-[14.5px] font-bold text-muted-foreground");
    expectSameClasses(p.factValue, "ml-auto text-right text-[14.5px] font-extrabold text-ink");
    expectSameClasses(cn(p.actions, p.webActions), "mt-4 flex gap-2.5");
    const action =
      "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border-strong bg-white px-3.5 py-3 text-[14.5px] font-extrabold transition-colors disabled:opacity-50";
    expectSameClasses(
      cn(p.action, p.webAction, p.actionText, p.blockText, p.webBlock),
      cn(action, "text-ink-2 hover:border-ink-2 hover:text-ink"),
    );
    expectSameClasses(
      cn(p.action, p.webAction, p.actionText, p.removeText, p.webRemove),
      cn(action, "text-danger hover:border-danger hover:bg-danger-soft"),
    );
  });

  it("friends: add a friend, QR code and scanner", () => {
    const a = addFriend;
    expectSameClasses(a.root, "mx-auto w-full max-w-[460px] px-5 pb-8");
    expectSameClasses(a.title, "mb-4 mt-1 text-2xl font-extrabold tracking-tight text-ink");
    expectSameClasses(cn(a.segments, a.webSegments), "mb-[18px] flex gap-1 rounded-2xl bg-white/70 p-[5px]");
    const seg =
      "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-[11px] text-[13.5px] font-extrabold transition-colors";
    expectSameClasses(
      cn(a.segment, a.segmentText, a.webSegment, a.segmentActive, a.segmentActiveText, a.webSegmentActive),
      cn(seg, "bg-white text-primary shadow-[0_2px_8px_rgba(34,56,78,0.08)]"),
    );
    expectSameClasses(cn(a.segment, a.segmentText, a.webSegment, a.segmentIdleText), cn(seg, "text-muted-foreground"));
    const card =
      "flex flex-col items-center rounded-[26px] bg-white px-6 py-[26px] shadow-[0_4px_18px_rgba(34,56,78,0.06)]";
    expectSameClasses(cn(a.card, a.webCard), card);
    expectSameClasses(cn(a.card, a.webCard, a.cardStretch), cn(card, "items-stretch"));
    expectSameClasses(
      cn(a.sentIcon, a.webSentIcon),
      "flex size-16 items-center justify-center rounded-full bg-success-soft text-success",
    );
    expectSameClasses(a.sentTitle, "mt-3.5 text-xl font-extrabold text-ink");
    expectSameClasses(
      cn(a.sentSub, a.textAlign),
      "mt-2 max-w-[320px] text-center text-sm font-semibold leading-relaxed text-muted-foreground",
    );
    expectSameClasses(a.qrFrame, "rounded-[20px] border-2 border-border bg-white p-4");
    expectSameClasses(
      cn(a.code, a.codeText, a.webCode),
      "mt-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-4 py-2 font-mono text-sm font-bold text-primary transition-colors hover:bg-primary-soft-2",
    );
    const hint = "mt-4 max-w-[300px] text-center text-[13.5px] font-semibold leading-relaxed text-muted-foreground";
    expectSameClasses(cn(a.hint, a.textAlign), hint);
    expectSameClasses(cn(a.hint, a.tagHint, a.textAlign), cn(hint, "self-center"));
    expectSameClasses(cn(a.tagLabel, a.fieldLabel), "mb-2.5 text-sm font-extrabold text-ink-2");
    expectSameClasses(cn(a.nicknameLabel, a.fieldLabel), "mb-1 mt-4 text-sm font-extrabold text-ink-2");
    expectSameClasses(
      cn(a.input, a.tagInput, a.webInput),
      "rounded-2xl border-2 border-border-strong bg-muted px-4 py-3.5 text-center font-mono text-[17px] font-bold text-ink outline-none focus:border-primary focus:bg-white",
    );
    expectSameClasses(
      cn(a.input, a.nicknameInput, a.webInput),
      "rounded-2xl border-2 border-border-strong bg-muted px-4 py-3 text-center text-[15px] font-bold text-ink outline-none focus:border-primary focus:bg-white",
    );
    expectSameClasses(cn(a.error, a.textAlign), "mt-2 text-center text-[13.5px] font-bold text-danger");
    expectSameClasses(a.send, "mt-[18px] self-center");

    expectSameClasses(cn(qrCode.placeholder, qrCode.webPlaceholder), "inline-block rounded-[14px] bg-muted");
    const q = qrScanner;
    expectSameClasses(
      cn(q.error, q.webError),
      "flex aspect-square w-full max-w-[260px] flex-col items-center justify-center gap-3 rounded-[22px] bg-muted px-6 text-center",
    );
    expectSameClasses(q.errorText, "text-[13.5px] font-bold leading-relaxed text-muted-foreground");
    expectSameClasses(
      cn(q.frame, q.webFrame),
      "relative flex aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-[22px] bg-[radial-gradient(circle_at_50%_40%,#2c3f54,#1b2735)]",
    );
    expectSameClasses(
      cn(q.corner, q.cornerTopLeft),
      "absolute left-[18px] top-[18px] size-[30px] rounded-tl-[10px] border-l-[3.5px] border-t-[3.5px] border-white/90",
    );
    expectSameClasses(
      cn(q.corner, q.cornerBottomRight),
      "absolute bottom-[18px] right-[18px] size-[30px] rounded-br-[10px] border-b-[3.5px] border-r-[3.5px] border-white/90",
    );
    expectSameClasses(
      cn(q.hint, q.hintText, q.webHint),
      "absolute bottom-3 left-0 right-0 px-6 text-center text-[13px] font-bold text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]",
    );
  });
  it("companion: compact dodi, listening pulse, volume control", () => {
    const c = companionCompact;
    expectSameClasses(cn(c.webRoot, c.root), "flex min-w-0 items-center gap-2.5");
    expectSameClasses(
      cn(c.button, c.webButton),
      "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dodi-200 bg-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-60",
    );
    expectSameClasses(cn("rounded-full", c.webThinking), "rounded-full animate-kspin");
    expectSameClasses(
      cn(c.speakingRing, c.webSpeakingRing),
      "absolute inset-0 animate-ping rounded-full border-2 border-dodi-400 opacity-40",
    );
    expectSameClasses(
      cn(c.connectingRing, c.webConnectingRing),
      "absolute inset-0 animate-spin rounded-full border-2 border-dodi-400 border-t-transparent",
    );
    expectSameClasses(
      cn(c.offlineBadge, c.webOfflineBadge),
      "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-dodi-200 bg-white",
    );
    expectSameClasses(
      cn(c.statusDot, c.connectedDot),
      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-success",
    );
    expectSameClasses(
      cn(c.statusDot, c.errorDot),
      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-danger",
    );
    expectSameClasses(c.liveRegion, "min-w-0");
    expectSameClasses(
      cn(c.bubble, c.webBubble),
      "relative flex h-10 min-w-0 items-center rounded-full bg-white px-3.5 shadow-sm animate-in fade-in slide-in-from-left-2 duration-200",
    );
    expectSameClasses(
      cn(c.bubbleTail, c.webBubbleTail),
      "absolute -left-1 top-1/2 size-2.5 -translate-y-1/2 rotate-45 rounded-[2px] bg-white",
    );
    expectSameClasses(
      cn(c.bubbleText, c.webBubbleText),
      "relative min-w-0 truncate text-[13px] font-bold text-ink-2",
    );

    const p = listeningPulse;
    expectSameClasses(cn(p.webFirst, p.circle), "animate-kpulse absolute inset-6 rounded-full");
    expectSameClasses(cn(p.webSecond, p.circle), "animate-kpulse-2 absolute inset-6 rounded-full");
    expectSameClasses(cn(p.webSecond, p.circle, "-inset-2"), "animate-kpulse-2 absolute -inset-2 rounded-full");
    expect(
      `radial-gradient(circle, rgba(${p.rgb},${p.centerOpacity}) 0%, rgba(${p.rgb},0) ${p.fadeStopPercent}%)`,
    ).toBe("radial-gradient(circle, rgba(95,155,216,0.22) 0%, rgba(95,155,216,0) 70%)");

    const v = companionVolume;
    expectSameClasses(v.root, "relative shrink-0");
    const button =
      "relative flex h-11 w-11 items-center justify-center rounded-full border border-dodi-200 bg-white shadow-sm transition-shadow hover:shadow-md";
    expectSameClasses(cn(v.button, v.webButton), button);
    expectSameClasses(cn(v.button, v.webButton, v.mutedButtonText), cn(button, "text-danger"));
    expectSameClasses(
      cn(v.flyout, v.webFlyout),
      "absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-dodi-200 bg-white p-4 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150",
    );
    expectSameClasses(cn(v.webLabel, v.label), "mb-2 block text-[13px] font-bold text-ink-2");
    expectSameClasses(
      v.webSlider,
      "h-11 w-full cursor-pointer accent-dodi-500 disabled:cursor-not-allowed disabled:opacity-50",
    );
    const mute =
      "mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-[13px] font-bold transition-colors";
    expectSameClasses(
      cn(v.mute, v.webMute, v.muteText, v.muteOn, v.muteOnText),
      cn(mute, "border-danger/30 bg-danger/10 text-danger"),
    );
    expectSameClasses(
      cn(v.mute, v.webMute, v.muteText, v.muteOff, v.muteOffText, v.webMuteOff),
      cn(mute, "border-dodi-200 bg-white text-ink-2 hover:bg-dodi-50"),
    );
  });
});
