import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";
import {
  activeToggle,
  agentRun,
  agentRunCheck,
  agentRunFrames,
  audiencePill,
  chatHeader,
  chatMessage,
  chatThinking,
  chatThread,
  chatWelcome,
  codeDiff,
  codeViewer,
  composer,
  composerNotice,
  emptyStage,
  listingTranslations,
  optionChip,
  planActionBar,
  planCard,
  planPill,
  planSurface,
  previewLocale,
  referenceSheet,
  richText,
  sketchPad,
  stageBody,
  stageHeader,
  studioActionRow,
  studioFrame,
  studioSeg,
  studioSettings,
  studioTab,
  studioTabBar,
  studioTextarea,
  tagPicker,
} from "@dodi/ui-recipes";

/**
 * The web Game Studio now takes its classes from @dodi/ui-recipes (shared
 * with the mobile app's studio). Moving them there must not change the web:
 * each element's final class set must equal the pre-move string pinned below,
 * except for additions that are no-ops in a browser. Same rules as
 * recipes-parity.test.ts.
 */
const WEB_NO_OPS = new Set([
  // React Native lays out in columns by default and needs the row direction
  // spelled out; on the web these sit on flex containers that are rows already.
  "flex-row",
  // Colors the web already inherits from the body / the global border rule.
  "text-foreground",
  "border-border",
  // align-self on a w-fit element (it already hugs its content).
  "self-start",
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

describe("web Game Studio keeps its classes after moving to @dodi/ui-recipes", () => {
  it("frame, panes and the Game / dodi switch", () => {
    expectSameClasses(
      cn(studioFrame.webRoot, studioFrame.root),
      "fixed inset-x-0 top-[60px] bottom-0 z-30 flex flex-col border-t border-border bg-background wide:top-[72px] wide:left-56",
    );
    expectSameClasses(
      cn(studioFrame.webPanes, studioFrame.panes, studioFrame.panesVertical),
      "flex min-h-0 flex-1 overflow-hidden flex-col",
    );
    expectSameClasses(
      cn(studioFrame.webPanes, studioFrame.panes, studioFrame.webPanesSide),
      "flex min-h-0 flex-1 overflow-hidden flex-row",
    );
    expectSameClasses(cn(studioFrame.webMain, studioFrame.main), "flex min-h-0 min-w-0 flex-1 flex-col bg-background");
    expectSameClasses(
      cn(studioFrame.webChat, studioFrame.chat, studioFrame.chatVertical),
      "relative flex min-h-0 flex-col border-border bg-card w-full flex-1",
    );
    expectSameClasses(
      cn(studioFrame.webChat, studioFrame.chat, studioFrame.webChatSide),
      "relative flex min-h-0 flex-col border-border bg-card flex-none border-l",
    );
    expectSameClasses(
      cn(studioTabBar.web, studioTabBar.box),
      "flex flex-shrink-0 gap-1 border-b border-border bg-card px-3 py-2",
    );
    const tab = "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border px-2.5 py-2 text-[13.5px] font-semibold transition-colors";
    expectSameClasses(
      cn(studioTab.box, studioTab.text, studioTab.web, cn(studioTab.active, studioTab.activeText)),
      `${tab} border-primary-soft-2 bg-primary-soft text-primary`,
    );
    expectSameClasses(
      cn(studioTab.box, studioTab.text, studioTab.web, cn(studioTab.idle, studioTab.idleText)),
      `${tab} border-border bg-background text-muted-foreground`,
    );
  });

  it("stage header: view switch, preview language, active toggle", () => {
    expectSameClasses(
      cn(stageHeader.web, stageHeader.box),
      "flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 md:px-5",
    );
    expectSameClasses(cn(stageHeader.webRight, stageHeader.right), "flex items-center gap-2.5");
    expectSameClasses(
      cn(studioSeg.webGroup, studioSeg.group),
      "inline-flex gap-0.5 rounded-[10px] border border-border bg-background p-[3px]",
    );
    const seg = "inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-[7px] text-[13px] font-semibold transition-colors";
    expectSameClasses(
      cn(studioSeg.box, studioSeg.text, studioSeg.web, cn(studioSeg.active, studioSeg.activeText, studioSeg.webActive)),
      `${seg} bg-card text-ink shadow-[0_1px_2px_rgba(34,56,78,0.06)]`,
    );
    expectSameClasses(
      cn(studioSeg.box, studioSeg.text, studioSeg.web, cn(studioSeg.idleText, studioSeg.webIdle)),
      `${seg} text-muted-foreground hover:text-ink-2`,
    );
    const locale = "rounded-[8px] px-2 py-1 text-[11px] font-semibold uppercase transition-colors";
    expectSameClasses(
      cn(previewLocale.box, previewLocale.text, previewLocale.web, cn(previewLocale.active, previewLocale.activeText, previewLocale.webActive)),
      `${locale} bg-card text-foreground shadow-sm`,
    );
    expectSameClasses(
      cn(previewLocale.box, previewLocale.text, previewLocale.web, cn(previewLocale.idleText, previewLocale.webIdle)),
      `${locale} text-muted-foreground hover:text-foreground`,
    );
    const toggle =
      "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
    expectSameClasses(
      cn(activeToggle.box, activeToggle.text, activeToggle.web, cn(activeToggle.on, activeToggle.onText)),
      `${toggle} border-primary-soft-2 bg-primary-soft text-primary`,
    );
    expectSameClasses(
      cn(activeToggle.box, activeToggle.text, activeToggle.web, cn(activeToggle.off, activeToggle.offText, activeToggle.webOff)),
      `${toggle} border-border-strong bg-card text-muted-foreground hover:border-faint`,
    );
    const track = "relative inline-flex h-4 w-[27px] shrink-0 items-center rounded-full transition-colors";
    expectSameClasses(cn(activeToggle.track, activeToggle.webTrack, activeToggle.trackOn), `${track} bg-primary`);
    expectSameClasses(cn(activeToggle.track, activeToggle.webTrack, activeToggle.trackOff), `${track} bg-border-strong`);
    const thumb = "inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform";
    expectSameClasses(cn(activeToggle.thumb, activeToggle.webThumb, activeToggle.thumbOn), `${thumb} translate-x-[13px]`);
    expectSameClasses(cn(activeToggle.thumb, activeToggle.webThumb, activeToggle.thumbOff), `${thumb} translate-x-[2px]`);
  });

  it("stage body and empty states", () => {
    expectSameClasses(cn(stageBody.box, stageBody.web), "relative min-h-0 min-w-0 flex-1 overflow-y-auto");
    expectSameClasses(cn(stageBody.webCenter, stageBody.center), "flex min-h-full items-center justify-center p-5 md:p-8");
    expectSameClasses(cn(stageBody.webCenterCode, stageBody.centerCode), "flex min-h-full items-center justify-center p-8");
    expectSameClasses(cn(emptyStage.box, emptyStage.text), "m-auto max-w-[280px] text-center");
    expectSameClasses(
      cn(emptyStage.webIconBox, emptyStage.iconBox),
      "mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card text-faint",
    );
    expectSameClasses(emptyStage.title, "text-[13px] leading-relaxed text-muted-foreground");
  });

  it("chat header and thread", () => {
    expectSameClasses(
      cn(chatHeader.web, chatHeader.box),
      "flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-3",
    );
    expectSameClasses(
      cn(chatHeader.webAvatar, chatHeader.avatar),
      "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft p-0.5",
    );
    expectSameClasses(cn(chatHeader.avatarImage, chatHeader.webAvatarImage), "h-full w-full object-contain");
    expectSameClasses(chatHeader.info, "min-w-0 flex-1");
    expectSameClasses(chatHeader.name, "text-sm font-bold text-ink");
    expectSameClasses(
      cn(chatHeader.webStatus, chatHeader.status, chatHeader.statusText),
      "mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground",
    );
    expectSameClasses(
      cn(chatHeader.webDot, chatHeader.dot, cn(chatHeader.webDotBusy, chatHeader.dotBusy)),
      "inline-block h-[7px] w-[7px] rounded-full animate-pulse bg-primary",
    );
    expectSameClasses(cn(chatHeader.webDot, chatHeader.dot, chatHeader.dotIdle), "inline-block h-[7px] w-[7px] rounded-full bg-success");
    expectSameClasses(chatHeader.webStatusLabel, "truncate");
    expectSameClasses(
      cn(chatHeader.clear, chatHeader.webClear),
      "ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
    );
    expectSameClasses(cn(chatThread.box, chatThread.web), "min-h-0 flex-1 overflow-y-auto");
    expectSameClasses(cn(chatThread.webInner, chatThread.inner), "flex flex-col gap-[18px] px-[18px] pb-1.5 pt-[18px]");
    expectSameClasses(
      cn(chatWelcome.web, chatWelcome.box, chatWelcome.text, chatWelcome.plan),
      "flex flex-col items-center px-1 text-center pb-2 pt-3",
    );
    expectSameClasses(
      cn(chatWelcome.web, chatWelcome.box, chatWelcome.text, chatWelcome.idle),
      "flex flex-col items-center px-1 text-center pb-2 pt-6",
    );
    expectSameClasses(cn(chatWelcome.image, chatWelcome.webImage), "mb-3 h-14 w-14 object-contain");
    expectSameClasses(chatWelcome.title, "text-[18px] font-bold tracking-tight text-ink");
    expectSameClasses(chatWelcome.description, "mt-1.5 text-[13px] leading-relaxed text-muted-foreground");
    expectSameClasses(cn(chatWelcome.webList, chatWelcome.list), "mt-[18px] flex w-full flex-col gap-2");
    const row =
      "flex items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-[11px] text-left text-[13.5px] font-medium text-ink-2 transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary";
    expectSameClasses(cn(studioActionRow.box, studioActionRow.text, studioActionRow.web), row);
    expectSameClasses(
      cn(studioActionRow.box, studioActionRow.text, studioActionRow.web, studioActionRow.webDisableable),
      `${row} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card disabled:hover:text-ink-2`,
    );
  });

  it("chat messages and dodi at work", () => {
    expectSameClasses(cn(chatMessage.webRow, chatMessage.row), "flex items-start gap-3");
    expectSameClasses(cn(chatMessage.avatar, chatMessage.webAvatar), "-mt-px h-[30px] w-[30px] shrink-0 object-contain");
    expectSameClasses(cn(chatMessage.body, chatMessage.bodyText), "min-w-0 flex-1 text-sm leading-[1.6] text-ink");
    expectSameClasses(chatMessage.body, "min-w-0 flex-1");
    expectSameClasses(
      cn(chatMessage.webLinks, chatMessage.links, chatMessage.linksText),
      "mt-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-faint",
    );
    expectSameClasses(chatMessage.webLink, "underline-offset-2 transition-colors hover:text-primary hover:underline");
    expectSameClasses(
      cn(chatMessage.webLink, chatMessage.webLinkDisableable),
      "underline-offset-2 transition-colors hover:text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-faint disabled:hover:no-underline",
    );
    expectSameClasses(cn(chatMessage.webUserRow, chatMessage.userRow), "flex justify-end");
    expectSameClasses(
      cn(chatMessage.bubble, chatMessage.bubbleText),
      "max-w-[88%] rounded-2xl rounded-tr-[5px] bg-primary-soft px-3.5 py-2.5 text-sm font-medium leading-[1.6] text-ink",
    );
    expectSameClasses(cn(chatMessage.webImages, chatMessage.images), "mb-2 flex flex-wrap gap-1.5");
    expectSameClasses(cn(chatMessage.image, chatMessage.webImage), "h-16 w-16 rounded-lg border border-border object-cover");
    expectSameClasses(cn(chatThinking.webDots, chatThinking.dots), "flex gap-1.5 py-1.5");
    const delays = ["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"];
    chatThinking.webDotDelays.forEach((delay, i) => {
      expectSameClasses(
        cn(chatThinking.dot, chatThinking.webDot, delay),
        `h-[7px] w-[7px] animate-bounce rounded-full bg-faint ${delays[i]}`,
      );
    });
    expect(chatThinking.webDotDelays).toHaveLength(3);
    expectSameClasses(
      cn(chatThinking.narration, chatThinking.webNarration),
      "mt-1 whitespace-pre-wrap text-[12.5px] italic leading-relaxed text-muted-foreground",
    );
    expectSameClasses(chatThinking.writeProgress, "mt-1 text-[11.5px] font-medium tabular-nums text-faint");
  });

  it("composer and its notices", () => {
    expectSameClasses(composer.box, "flex-shrink-0 px-4 pb-3.5 pt-2");
    expectSameClasses(
      cn(composerNotice.web, composerNotice.box, composerNotice.text, composerNotice.warning, composerNotice.warningText),
      "mb-2 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning",
    );
    expectSameClasses(
      cn(composerNotice.web, composerNotice.box, composerNotice.text, composerNotice.primary, composerNotice.primaryText),
      "mb-2 flex items-start gap-1.5 rounded-lg bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary",
    );
    expectSameClasses(
      cn(composerNotice.web, composerNotice.resume, composerNotice.resumeText),
      "mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary",
    );
    expectSameClasses(composerNotice.resumeLabel, "min-w-0 flex-1");
    expectSameClasses(
      cn(composerNotice.error, composerNotice.errorText),
      "mb-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs font-medium text-danger",
    );
    expectSameClasses(
      cn(composerNotice.link, composerNotice.webLink),
      "font-semibold underline underline-offset-2 hover:opacity-80",
    );
    expectSameClasses(
      cn(composer.card, composer.webCard),
      "relative rounded-2xl border border-border-strong bg-card px-4 pb-2.5 pt-3 shadow-[0_4px_18px_rgba(34,56,78,0.07)] transition-colors focus-within:border-primary",
    );
    expectSameClasses(cn(composer.webPending, composer.pending), "mb-2 flex flex-wrap gap-2");
    expectSameClasses(cn(composer.pendingImage, composer.webPendingImage), "h-12 w-12 rounded-lg border border-border object-cover");
    expectSameClasses(
      cn(composer.remove, composer.webRemove),
      "absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-danger",
    );
    expectSameClasses(
      cn(composer.input, composer.inputText, composer.webInput),
      "block w-full resize-none border-0 bg-transparent p-0 pb-1.5 text-[14.5px] leading-normal text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed",
    );
    expectSameClasses(cn(composer.webActions, composer.actions), "flex items-center justify-between");
    expectSameClasses(
      cn(composer.attach, composer.webAttach),
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-40",
    );
    const send = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors active:scale-95";
    expectSameClasses(
      cn(composer.send, composer.webSend, cn(composer.sendOn, composer.webSendOn)),
      `${send} bg-primary hover:bg-primary-hover`,
    );
    expectSameClasses(cn(composer.send, composer.webSend, composer.sendOff), `${send} bg-border-strong`);
    expectSameClasses(composer.footer, "mt-2 text-center text-[11px] leading-snug text-faint");
  });

  it("Plan step: surfaces, plan card, pills, image sheet", () => {
    expectSameClasses(cn(planSurface.webRoot, planSurface.root), "flex min-h-0 flex-1 flex-col");
    expectSameClasses(
      cn(planSurface.webHeader, planSurface.header),
      "flex shrink-0 items-center gap-2 border-b border-border px-2 py-2",
    );
    expectSameClasses(
      cn(planSurface.back, planSurface.webBack),
      "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary",
    );
    expectSameClasses(cn(planSurface.title, planSurface.webTitle), "min-w-0 flex-1 truncate text-[15px] font-bold text-ink");
    expectSameClasses(
      cn(planSurface.body, planSurface.bodyPadding, planSurface.webBody),
      "min-h-0 flex-1 overflow-y-auto px-4 py-3",
    );
    expectSameClasses(cn(planSurface.webColumn, planSurface.column), "mx-auto flex w-full max-w-2xl flex-col gap-4");
    expectSameClasses(
      cn(planSurface.webSketchArea, planSurface.sketchArea),
      "flex min-h-0 flex-1 items-center justify-center p-2 [container-type:size]",
    );
    expectSameClasses(cn(planCard.webSection, planCard.section), "flex flex-col gap-2.5");
    expectSameClasses(planCard.empty, "text-[12.5px] leading-relaxed text-muted-foreground");
    expectSameClasses(
      cn(planCard.editor, planCard.editorText, planCard.webEditor),
      "w-full resize-y rounded-lg border border-border-strong bg-background p-3 text-[13px] leading-relaxed text-ink outline-none focus:border-primary",
    );
    expectSameClasses(planCard.bodyText, "text-[13px] leading-[1.6] text-ink");
    expectSameClasses(
      cn(planCard.personalize, planCard.personalizeText, planCard.webPersonalize),
      "flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-[12.5px] font-medium text-ink-2 transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50",
    );
    expectSameClasses(cn(planCard.webActions, planCard.actions), "flex flex-col gap-2 border-t border-border pt-4");
    expectSameClasses(
      cn(planActionBar.web, planActionBar.box, planActionBar.content),
      "flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-3 py-2",
    );
    const pill =
      "inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
    expectSameClasses(
      cn(planPill.box, planPill.text, planPill.web, cn(planPill.on, planPill.onText)),
      `${pill} border-primary-soft-2 bg-primary-soft text-primary`,
    );
    expectSameClasses(
      cn(planPill.box, planPill.text, planPill.web, cn(planPill.off, planPill.offText)),
      `${pill} border-border bg-background text-muted-foreground`,
    );
    expectSameClasses(cn(referenceSheet.webList, referenceSheet.list), "flex flex-col gap-2");
  });

  it("sketch pad", () => {
    expect(sketchPad.toolbarHeight).toBe(56);
    expectSameClasses(
      cn(sketchPad.webCard, sketchPad.card),
      "flex flex-col overflow-hidden rounded-[18px] border border-border bg-white shadow-[0_8px_28px_rgba(34,56,78,0.10)]",
    );
    expectSameClasses(
      cn(sketchPad.webToolbar, sketchPad.toolbar, sketchPad.toolbarContent),
      "flex shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3",
    );
    expectSameClasses(cn(sketchPad.webGroup, sketchPad.group), "flex items-center gap-1");
    expectSameClasses(cn(sketchPad.webGroup, sketchPad.groupEnd), "ml-auto flex items-center gap-1");
    expectSameClasses(
      cn(sketchPad.webSwatchButton, sketchPad.swatchButton),
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
    );
    const swatch = "h-6 w-6 rounded-full border border-black/10 transition-transform";
    expectSameClasses(cn(sketchPad.swatch, sketchPad.webSwatch), swatch);
    expectSameClasses(
      cn(sketchPad.swatch, sketchPad.webSwatch, cn(sketchPad.swatchSelected, sketchPad.webSwatchSelected)),
      `${swatch} scale-110 ring-2 ring-primary ring-offset-2 ring-offset-white`,
    );
    const tool =
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border transition-colors disabled:cursor-not-allowed disabled:opacity-40";
    expectSameClasses(
      cn(sketchPad.tool, sketchPad.webTool, cn(sketchPad.toolOn, sketchPad.webToolOn)),
      `${tool} border-primary bg-primary-soft text-primary`,
    );
    expectSameClasses(
      cn(sketchPad.tool, sketchPad.webTool, cn(sketchPad.toolOff, sketchPad.webToolOff)),
      `${tool} border-border bg-card text-muted-foreground hover:border-faint hover:text-ink`,
    );
    expectSameClasses(sketchPad.webToolDanger, "hover:border-danger hover:text-danger");
    expectSameClasses(sketchPad.penDot, "rounded-full");
    expectSameClasses(cn(sketchPad.canvas, sketchPad.webCanvas), "block w-full cursor-crosshair bg-white");
  });

  it("settings form", () => {
    expectSameClasses(cn(studioSettings.webForm, studioSettings.form), "mx-auto flex max-w-[560px] flex-col gap-4 p-5 md:p-8");
    expectSameClasses(cn(studioSettings.webField, studioSettings.field), "flex flex-col gap-1.5");
    expectSameClasses(cn(studioSettings.webLabelRow, studioSettings.labelRow), "flex items-center gap-2");
    expectSameClasses(studioSettings.label, "text-xs font-semibold text-ink-2");
    expectSameClasses(studioSettings.hint, "text-[11px] text-faint");
    expectSameClasses(studioSettings.error, "text-[11px] font-medium text-danger");
    expectSameClasses(cn(studioSettings.webChips, studioSettings.chips), "flex flex-wrap gap-2");
    expectSameClasses(
      cn(studioSettings.webChips, studioSettings.chips, cn(studioSettings.chipsInvalid, studioSettings.webChipsInvalid)),
      "flex flex-wrap gap-2 -m-2 rounded-lg border border-destructive p-2 ring-2 ring-destructive/20",
    );
    expectSameClasses(
      cn(studioSettings.webSwitchRow, studioSettings.switchRow, studioSettings.switchText),
      "flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2",
    );
    expectSameClasses(cn(studioSettings.webStack, studioSettings.stack), "flex flex-col gap-2");
    expectSameClasses(studioSettings.note, "text-xs text-muted-foreground");
    expectSameClasses(cn(studioSettings.link, studioSettings.webLink), "font-semibold underline underline-offset-2 hover:opacity-80");
    expectSameClasses(cn(studioSettings.webSave, studioSettings.save), "mt-2 flex flex-col gap-3 border-t border-border pt-6");
    expectSameClasses(
      cn(studioSettings.saveError, studioSettings.saveErrorText),
      "rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger",
    );
    const field =
      "w-full resize-y rounded-md border border-border-strong bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2";
    expectSameClasses(
      cn(studioTextarea.goal, studioTextarea.box, studioTextarea.text, studioTextarea.web, studioTextarea.webInvalid),
      `min-h-[76px] ${field} aria-invalid:border-destructive aria-invalid:ring-destructive/20`,
    );
    expectSameClasses(
      cn(studioTextarea.success, studioTextarea.box, studioTextarea.text, studioTextarea.web),
      `min-h-[72px] ${field}`,
    );
    const pill = "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors";
    expectSameClasses(
      cn(audiencePill.box, audiencePill.text, audiencePill.web, cn(audiencePill.selected, audiencePill.selectedText)),
      `${pill} border-primary bg-primary-soft text-primary`,
    );
    expectSameClasses(
      cn(audiencePill.box, audiencePill.text, audiencePill.web, cn(audiencePill.idle, audiencePill.idleText, audiencePill.webIdle)),
      `${pill} border-border-strong bg-card text-ink-2 hover:border-faint`,
    );
    expectSameClasses(
      cn(audiencePill.webInitial, audiencePill.initial, audiencePill.initialText),
      "flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary",
    );
    const chip = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors";
    expectSameClasses(
      cn(optionChip.box, optionChip.text, optionChip.web, cn(optionChip.selected, optionChip.selectedText)),
      `${chip} border-primary bg-primary-soft text-primary`,
    );
    expectSameClasses(
      cn(optionChip.box, optionChip.text, optionChip.web, cn(optionChip.idle, optionChip.idleText, optionChip.webIdle)),
      `${chip} border-border-strong bg-card text-ink-2 hover:border-faint`,
    );
    expectSameClasses(cn(tagPicker.web, tagPicker.box), "flex flex-wrap items-center gap-2");
    expectSameClasses(tagPicker.none, "text-sm text-muted-foreground");
    expectSameClasses(cn(listingTranslations.webRoot, listingTranslations.root), "flex scroll-mt-4 flex-col gap-1.5");
    expectSameClasses(cn(listingTranslations.webList, listingTranslations.list), "mt-1 flex flex-col gap-3");
    expectSameClasses(
      cn(listingTranslations.webCard, listingTranslations.card),
      "flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3",
    );
    expectSameClasses(listingTranslations.gameLanguage, "ml-1.5 font-normal text-faint");
    expectSameClasses(cn(studioTextarea.box, studioTextarea.text, studioTextarea.web, listingTranslations.flagged), `${field} border-warning`);
  });

  it("agent run log", () => {
    expectSameClasses(cn(agentRun.webRoot, agentRun.root), "group mt-1");
    expectSameClasses(
      cn(agentRun.summary, agentRun.summaryText, agentRun.webSummary),
      "text-faint hover:text-primary focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
    );
    expectSameClasses(agentRun.summaryMeta, "text-[11.5px] font-normal");
    expectSameClasses(
      cn(agentRun.summaryChevron, agentRun.webSummaryChevron),
      "text-[13px] transition-transform group-open:rotate-90 motion-reduce:transition-none",
    );
    expectSameClasses(agentRun.empty, "text-faint text-[11.5px] italic");
    expectSameClasses(cn(agentRun.list, agentRun.webList), "border-border mt-1.5 space-y-2 border-l pl-3");
    expectSameClasses(cn(agentRun.webItem, agentRun.item), "relative flex gap-2");
    expectSameClasses(agentRun.dot, "bg-border absolute top-[7px] -left-[16.5px] h-[7px] w-[7px] rounded-full");
    expectSameClasses(agentRun.time, "text-faint w-9 shrink-0 pt-px text-[11px] tabular-nums");
    expectSameClasses(agentRun.content, "min-w-0 flex-1");
    expectSameClasses(agentRun.step, "text-ink-2 text-[12.5px] font-semibold");
    expectSameClasses(
      cn(agentRun.narration, agentRun.webNarration),
      "text-muted-foreground text-[12.5px] leading-relaxed whitespace-pre-wrap italic",
    );
    expectSameClasses(
      cn(agentRunCheck.webTitle, agentRunCheck.title, agentRunCheck.titleText),
      "text-ink-2 flex items-center gap-1.5 text-[12.5px] font-semibold",
    );
    expectSameClasses(cn(agentRunCheck.status, agentRunCheck.statusBad), "text-[11.5px] font-medium text-destructive");
    expectSameClasses(cn(agentRunCheck.status, agentRunCheck.statusGood), "text-[11.5px] font-medium text-success");
    expectSameClasses(agentRunCheck.requested, "text-faint mt-0.5 text-[11.5px]");
    expectSameClasses(agentRunCheck.failed, "text-muted-foreground mt-0.5 text-[11.5px]");
    expectSameClasses(agentRunCheck.noFrames, "text-faint mt-0.5 text-[11.5px] italic");
    expectSameClasses(agentRunCheck.issues, "mt-1.5");
    expectSameClasses(cn(agentRunCheck.issuesTitle, agentRunCheck.issuesDanger), "text-[11.5px] font-semibold text-destructive");
    expectSameClasses(cn(agentRunCheck.issuesTitle, agentRunCheck.issuesWarning), "text-[11.5px] font-semibold text-warning");
    expectSameClasses(cn(agentRunCheck.issuesTitle, agentRunCheck.issuesMuted), "text-[11.5px] font-semibold text-muted-foreground");
    expectSameClasses(
      cn(agentRunCheck.issueList, agentRunCheck.issueText, agentRunCheck.webIssueList),
      "text-muted-foreground mt-0.5 list-disc space-y-0.5 pl-4 text-[11.5px] leading-snug",
    );
    expectSameClasses(agentRunCheck.webIssue, "break-words");
    expectSameClasses(cn(agentRunFrames.webList, agentRunFrames.list), "mt-1.5 flex flex-wrap gap-2");
    expectSameClasses(agentRunFrames.item, "w-[76px]");
    expectSameClasses(
      cn(agentRunFrames.button, agentRunFrames.webButton),
      "border-border bg-card hover:border-primary focus-visible:ring-ring block min-h-11 w-full overflow-hidden rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none",
    );
    expectSameClasses(cn(agentRunFrames.image, agentRunFrames.webImage), "aspect-[4/5] w-full object-cover");
    expectSameClasses(cn(agentRunFrames.label, agentRunFrames.webLabel), "text-faint mt-0.5 line-clamp-2 text-[10.5px] leading-tight");
    expectSameClasses(
      cn(agentRunFrames.large, agentRunFrames.webLarge),
      "border-border mx-auto max-h-[70vh] w-auto rounded-md border object-contain",
    );
  });

  it("rich text", () => {
    expectSameClasses(cn(richText.list, richText.webList), "mt-1 list-disc space-y-0.5 pl-4 first:mt-0");
    expectSameClasses(cn(richText.paragraph, richText.webParagraph), "mt-1 first:mt-0");
    expectSameClasses(richText.bold, "font-bold");
  });

  it("code viewer and diff", () => {
    expectSameClasses(
      cn(codeViewer.web, codeViewer.box, codeViewer.text),
      "dodi-code flex min-h-full flex-col bg-card font-mono text-[12.5px] leading-[1.75] text-ink-2",
    );
    expectSameClasses(
      cn(codeViewer.webHeader, codeViewer.header),
      "sticky top-0 z-10 flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-2",
    );
    expectSameClasses(
      cn(codeViewer.webFilename, codeViewer.filename, codeViewer.filenameText),
      "flex min-w-0 items-center gap-2 font-sans text-[12px] font-medium text-muted-foreground",
    );
    expectSameClasses(cn(codeViewer.webActions, codeViewer.actions), "flex flex-shrink-0 items-center gap-1");
    const button = "inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[12px] font-semibold transition-colors";
    expectSameClasses(
      cn(codeViewer.button, codeViewer.buttonText, codeViewer.webButton, cn(codeViewer.buttonActive, codeViewer.buttonActiveText)),
      `${button} bg-primary-soft text-primary`,
    );
    expectSameClasses(
      cn(codeViewer.button, codeViewer.buttonText, codeViewer.webButton, cn(codeViewer.buttonIdleText, codeViewer.webButtonIdle)),
      `${button} text-muted-foreground hover:bg-primary-soft hover:text-primary`,
    );
    expectSameClasses(
      cn(
        codeViewer.button,
        codeViewer.buttonText,
        codeViewer.webButton,
        cn(codeViewer.buttonIdleText, codeViewer.webButtonIdle),
        cn(codeViewer.buttonDisabled, codeViewer.webButtonDisabled),
      ),
      cn(
        button,
        "text-muted-foreground hover:bg-primary-soft hover:text-primary",
        "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
      ),
    );
    expectSameClasses(cn(codeViewer.webBody, codeViewer.body), "flex min-h-0 min-w-0 flex-1 overflow-auto");
    expectSameClasses(
      cn(codeViewer.gutter, codeViewer.gutterText, codeViewer.webGutter),
      "sticky left-0 z-[1] flex-shrink-0 select-none border-r border-border bg-card py-4 pl-4 pr-3 text-right text-faint",
    );
    expectSameClasses(cn(codeViewer.code, codeViewer.webCode), "w-max py-4 pl-4 pr-8");
    expectSameClasses(
      cn(codeDiff.gutter, codeViewer.gutterText, codeViewer.webGutter),
      "sticky left-0 z-[1] flex-shrink-0 select-none border-r border-border bg-card py-4 text-right text-faint",
    );
    expectSameClasses(codeDiff.skipNumber, "px-3 text-center");
    expectSameClasses(cn(codeDiff.webNumbers, codeDiff.numbers), "flex gap-2 pl-4 pr-3");
    expectSameClasses(codeDiff.added, "bg-success-soft");
    expectSameClasses(codeDiff.removed, "bg-danger-soft");
    expectSameClasses(cn(codeDiff.body, codeDiff.webBody), "w-max py-4 pr-8");
    expectSameClasses(
      cn(codeDiff.skip, codeDiff.skipText, codeDiff.webSkip),
      "block w-full whitespace-pre pl-2 text-left font-sans text-[12px] font-medium text-faint transition-colors hover:text-primary",
    );
    expectSameClasses(codeDiff.webLine, "whitespace-pre");
    expectSameClasses(cn(codeDiff.marker, codeDiff.webMarker), "inline-block w-6 select-none text-center font-bold");
    expectSameClasses(codeDiff.addedMarker, "text-success");
    expectSameClasses(codeDiff.removedMarker, "text-danger");
  });
});
