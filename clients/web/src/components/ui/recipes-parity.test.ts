import { describe, expect, it } from "vitest";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";
import {
  backLink,
  fieldRow,
  gameStage,
  input,
  label,
  navItem,
  radioCard,
  row,
  saveRow,
  section,
  settingsTab,
  switchControl,
} from "@dodi/ui-recipes";

/**
 * The web's components now take their classes from @dodi/ui-recipes (shared
 * with the mobile app). Moving them there must not change the web: each
 * component's final class set must equal the pre-move strings pinned below,
 * except for additions that are no-ops in a browser.
 */
const WEB_NO_OPS = new Set([
  // React Native lays out in columns by default and needs the row direction
  // spelled out; on the web these sit on flex containers that are rows already.
  "flex-row",
  // Colors the web already inherits from the body / the global border rule.
  "text-foreground",
  "border-border",
  // align-self on an element whose parent isn't a flex container.
  "self-start",
]);

const tokens = (classes: string): Set<string> => new Set(cn(classes).split(/\s+/).filter(Boolean));

function expectSameClasses(actual: string, original: string): void {
  const got = tokens(actual);
  const want = tokens(original);
  const missing = [...want].filter((c) => !got.has(c));
  const extra = [...got].filter((c) => !want.has(c) && !WEB_NO_OPS.has(c));
  expect({ missing, extra }).toEqual({ missing: [], extra: [] });
}

// ----- The pre-move definitions, verbatim ------------------------------------

const originalButton = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "border border-border-strong bg-card text-danger hover:border-danger hover:bg-danger-soft focus-visible:ring-destructive/20",
        outline: "border border-border-strong bg-card text-foreground hover:border-faint",
        secondary: "bg-secondary text-secondary-foreground hover:bg-primary-soft-2",
        ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const originalBadge = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-[11.5px] font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "bg-muted text-muted-foreground [a&]:hover:bg-primary-soft",
        destructive: "bg-danger-soft text-danger [a&]:hover:bg-danger-soft/80 focus-visible:ring-destructive/20",
        outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        success: "bg-success-soft text-success",
        blue: "bg-primary-soft text-primary",
        gray: "bg-muted text-muted-foreground",
        key: "bg-muted text-muted-foreground font-mono font-medium",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const VARIANTS = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
const SIZES = ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const;
const BADGES = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
  "success",
  "blue",
  "gray",
  "key",
] as const;

describe("web components keep their classes after moving to @dodi/ui-recipes", () => {
  it("Button, every variant × size", () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        expectSameClasses(buttonVariants({ variant, size }), originalButton({ variant, size }));
      }
    }
  });

  it("Badge, every variant", () => {
    for (const variant of BADGES) {
      expectSameClasses(badgeVariants({ variant }), originalBadge({ variant }));
    }
  });

  it("Input, Label, Switch", () => {
    expectSameClasses(
      cn(input.box, input.text, input.web),
      "file:text-foreground placeholder:text-faint selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-md border bg-card px-3 py-1 text-base transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium hover:border-faint disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-primary focus-visible:ring-primary-soft-2 focus-visible:ring-2 aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
    );
    expectSameClasses(
      cn(label.box, label.text, label.web),
      "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
    );
    expectSameClasses(
      cn(switchControl.track, switchControl.web),
      "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border-0 outline-none transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong focus-visible:ring-2 focus-visible:ring-primary-soft-2 disabled:cursor-not-allowed disabled:opacity-50",
    );
    expectSameClasses(
      cn(switchControl.thumb, switchControl.webThumb),
      "pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform data-[state=checked]:translate-x-[18px]",
    );
  });

  it("Section, rows, save row, back link", () => {
    expectSameClasses(
      cn(section.card, section.web),
      "overflow-hidden rounded-lg border bg-card shadow-card [&>*+*]:border-t [&>*+*]:border-border",
    );
    expectSameClasses(cn(section.head, "flex"), "mb-2.5 flex items-end justify-between gap-4");
    expectSameClasses(section.title, "text-base font-semibold tracking-tight");
    expectSameClasses(cn(row.box, row.web, row.webClickable), "flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-[#FAFCFE]");
    expectSameClasses(cn(row.title, "flex", row.titleText), "flex items-center gap-2 text-sm font-semibold");
    expectSameClasses(
      cn(fieldRow.box, fieldRow.web),
      "flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
    );
    expectSameClasses(cn(fieldRow.control, fieldRow.webControl), "flex items-center gap-2 sm:shrink-0");
    expectSameClasses(cn(saveRow.box, saveRow.web), "flex items-center justify-end gap-2.5 px-5 py-3.5");
    expectSameClasses(
      cn(backLink.box, backLink.text, backLink.web),
      "mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary",
    );
  });

  it("Drawer nav items and settings tabs", () => {
    expectSameClasses(
      cn(navItem.box, navItem.text, navItem.web, navItem.boxActive, navItem.textActive),
      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors bg-primary-soft font-semibold text-primary",
    );
    expectSameClasses(
      cn(navItem.box, navItem.text, navItem.web, navItem.textInactive, navItem.webInactive),
      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors font-medium text-ink-2 hover:bg-foreground/5",
    );
    expectSameClasses(
      cn(settingsTab.box, settingsTab.text, settingsTab.web, settingsTab.boxActive, settingsTab.textActive),
      "shrink-0 rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors bg-primary-soft font-semibold text-primary",
    );
    expectSameClasses(cn(settingsTab.strip, "flex overflow-x-auto"), "-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1");
  });

  it("Radio option cards", () => {
    expectSameClasses(cn(radioCard.webGroup, radioCard.group), "flex flex-col gap-2.5 px-5 py-4");
    expectSameClasses(
      cn(radioCard.web, radioCard.box, radioCard.boxSelected),
      "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors border-primary bg-primary-soft",
    );
    expectSameClasses(
      cn(radioCard.web, radioCard.box, radioCard.boxIdle, radioCard.webIdle),
      "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors border-border-strong bg-card hover:border-faint",
    );
    expectSameClasses(
      cn(radioCard.webDot, radioCard.dot, radioCard.dotSelected),
      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary bg-primary text-white",
    );
    expectSameClasses(cn(radioCard.webBody, radioCard.body), "flex flex-col gap-0.5");
    expectSameClasses(cn(radioCard.label, radioCard.labelIdle), "text-sm font-semibold text-ink-2");
  });

  it("Game stage card", () => {
    expectSameClasses(
      cn(gameStage.web, gameStage.framed, gameStage.webFramed),
      "w-[var(--stage-w)] overflow-hidden max-lg:portrait:w-full rounded-[18px] border border-border bg-white shadow-[0_8px_28px_rgba(34,56,78,0.10)]",
    );
    expectSameClasses(
      cn(gameStage.web, gameStage.bleed),
      "w-[var(--stage-w)] overflow-hidden max-lg:portrait:w-full rounded-xl bg-white",
    );
    expectSameClasses(cn(gameStage.webBleedWrap, gameStage.bleedWrap), "flex h-full w-full items-center justify-center");
  });
});
