/**
 * The design system's component styles, shared by the web and the mobile app.
 * Every recipe is the web's Tailwind classes split in three:
 *
 * - `box`:  layout, background, border, radius (the element itself)
 * - `text`: color, size, weight (React Native styles text only on <Text>, so
 *           mobile applies this to the label; the web joins it onto the box)
 * - `web`:  states and selectors only browsers have (hover, focus rings,
 *           `[&_svg]`, `has-[…]`, transitions)
 *
 * The web renders `cn(box, text, web)`; mobile renders `box` on the view and
 * `text` on its text. Restyle here and both clients change.
 */
import { cva } from "class-variance-authority";

// ----- Button ---------------------------------------------------------------

const buttonVariant = {
  default: "",
  destructive: "",
  outline: "",
  secondary: "",
  ghost: "",
  link: "",
} as const;
const buttonSize = {
  default: "",
  xs: "",
  sm: "",
  lg: "",
  icon: "",
  "icon-xs": "",
  "icon-sm": "",
  "icon-lg": "",
} as const;

export type ButtonVariant = keyof typeof buttonVariant;
export type ButtonSize = keyof typeof buttonSize;

export const button = {
  box: cva("flex-row items-center justify-center gap-2 rounded-md shrink-0 disabled:opacity-50", {
    variants: {
      variant: {
        ...buttonVariant,
        default: "bg-primary",
        destructive: "border border-border-strong bg-card",
        outline: "border border-border-strong bg-card",
        secondary: "bg-secondary",
      },
      size: {
        ...buttonSize,
        default: "h-9 px-4",
        xs: "h-6 gap-1 rounded-md px-2",
        sm: "h-8 rounded-md gap-1.5 px-3",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }),
  text: cva("text-sm font-semibold", {
    variants: {
      variant: {
        ...buttonVariant,
        default: "text-primary-foreground",
        destructive: "text-danger",
        outline: "text-foreground",
        secondary: "text-secondary-foreground",
        ghost: "text-muted-foreground",
        link: "text-primary",
      },
      size: { ...buttonSize, xs: "text-xs" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }),
  web: cva(
    "inline-flex whitespace-nowrap transition-all disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
    {
      variants: {
        variant: {
          ...buttonVariant,
          default: "hover:bg-primary-hover",
          destructive: "hover:border-danger hover:bg-danger-soft focus-visible:ring-destructive/20",
          outline: "hover:border-faint",
          secondary: "hover:bg-primary-soft-2",
          ghost: "hover:bg-accent hover:text-accent-foreground",
          link: "underline-offset-4 hover:underline",
        },
        size: {
          ...buttonSize,
          default: "py-2 has-[>svg]:px-3",
          xs: "has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
          sm: "has-[>svg]:px-2.5",
          lg: "has-[>svg]:px-4",
          "icon-xs": "[&_svg:not([class*='size-'])]:size-3",
        },
      },
      defaultVariants: { variant: "default", size: "default" },
    },
  ),
};

/** Icon color per variant (the label color, as a design-token name). */
export const buttonIconColor = {
  default: "primary-foreground",
  destructive: "danger",
  outline: "foreground",
  secondary: "secondary-foreground",
  ghost: "muted-foreground",
  link: "primary",
} as const satisfies Record<ButtonVariant, string>;

// ----- Badge ----------------------------------------------------------------

const badgeVariant = {
  default: "",
  secondary: "",
  destructive: "",
  outline: "",
  ghost: "",
  link: "",
  success: "",
  blue: "",
  gray: "",
  key: "",
} as const;
export type BadgeVariant = keyof typeof badgeVariant;

export const badge = {
  box: cva(
    "flex-row items-center justify-center rounded-full border border-transparent px-2 py-0.5 shrink-0 gap-1 overflow-hidden",
    {
      variants: {
        variant: {
          ...badgeVariant,
          default: "bg-primary",
          secondary: "bg-muted",
          destructive: "bg-danger-soft",
          outline: "border-border",
          success: "bg-success-soft",
          blue: "bg-primary-soft",
          gray: "bg-muted",
          key: "bg-muted",
        },
      },
      defaultVariants: { variant: "default" },
    },
  ),
  text: cva("text-[11.5px] font-semibold", {
    variants: {
      variant: {
        ...badgeVariant,
        default: "text-primary-foreground",
        secondary: "text-muted-foreground",
        destructive: "text-danger",
        outline: "text-foreground",
        link: "text-primary",
        success: "text-success",
        blue: "text-primary",
        gray: "text-muted-foreground",
        key: "text-muted-foreground font-mono font-medium",
      },
    },
    defaultVariants: { variant: "default" },
  }),
  web: cva(
    "inline-flex w-fit whitespace-nowrap [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow]",
    {
      variants: {
        variant: {
          ...badgeVariant,
          default: "[a&]:hover:bg-primary/90",
          secondary: "[a&]:hover:bg-primary-soft",
          destructive: "[a&]:hover:bg-danger-soft/80 focus-visible:ring-destructive/20",
          outline: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
          ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
          link: "underline-offset-4 [a&]:hover:underline",
        },
      },
      defaultVariants: { variant: "default" },
    },
  ),
};

// ----- Form fields ------------------------------------------------------------

export const input = {
  box: "border-input h-9 w-full min-w-0 rounded-md border bg-card px-3 py-1 disabled:opacity-50",
  /** 16px on phones (no zoom-on-focus); the web drops to 14px from md up. */
  text: "text-base text-foreground",
  web: "file:text-foreground placeholder:text-faint selection:bg-primary selection:text-primary-foreground transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium hover:border-faint disabled:pointer-events-none disabled:cursor-not-allowed md:text-sm focus-visible:border-primary focus-visible:ring-primary-soft-2 focus-visible:ring-2 aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  /** The focused field (mobile has no :focus-visible). */
  focused: "border-primary",
  invalid: "border-destructive",
  placeholderColor: "#93A5B8",
} as const;

/** A multi-line text field, styled like the inputs (mobile: TextInput multiline). */
export const textarea = {
  box: "min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 disabled:opacity-50",
  text: "text-base text-foreground",
  web: "outline-none placeholder:text-faint transition-[color,box-shadow,border-color] hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 md:text-sm",
  placeholderColor: "#93A5B8",
} as const;

/** A select styled like the inputs inside a FieldRow. */
export const fieldSelect = {
  box: "h-9 w-full rounded-md border border-input bg-card px-3",
  text: "text-sm text-foreground",
  web: "outline-none transition-[color,box-shadow,border-color] hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 sm:w-[250px]",
} as const;

export const label = {
  box: "flex-row items-center gap-2",
  text: "text-sm leading-none font-medium",
  web: "flex select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
} as const;

export const switchControl = {
  track: "h-5 w-9 shrink-0 rounded-full border-0 disabled:opacity-50",
  trackOn: "bg-primary",
  trackOff: "bg-border-strong",
  thumb: "size-4 rounded-full bg-white",
  /** Thumb offset in px (web: translate-x-0.5 / translate-x-[18px]). */
  thumbOffset: { off: 2, on: 18 },
  web: "peer inline-flex items-center outline-none transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong focus-visible:ring-2 focus-visible:ring-primary-soft-2 disabled:cursor-not-allowed",
  webThumb:
    "pointer-events-none block translate-x-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform data-[state=checked]:translate-x-[18px]",
} as const;

/** One cell of the 4/6-digit PIN entry. */
export const pinCell = {
  row: "flex-row justify-center gap-2.5",
  box: "h-14 w-12 rounded-md border border-input bg-card",
  text: "text-center text-2xl font-semibold text-foreground",
  focused: "border-primary",
  invalid: "border-destructive",
} as const;

// ----- Card -----------------------------------------------------------------

export const card = {
  root: "bg-card flex flex-col gap-6 rounded-lg border border-border py-6 shadow-card",
  header: "gap-2 px-6",
  title: "leading-none font-semibold text-card-foreground",
  description: "text-muted-foreground text-sm",
  content: "px-6",
  footer: "flex-row items-center px-6",
} as const;

// ----- Overlays ---------------------------------------------------------------

export const sheet = {
  overlay: "bg-black/40",
  content: "gap-3 rounded-t-2xl border border-border bg-card px-4 pt-3",
  handle: "mx-auto h-1 w-10 rounded-full bg-border-strong",
  title: "text-[15px] font-bold text-ink",
  description: "text-[12.5px] leading-relaxed text-muted-foreground",
} as const;

export const dialog = {
  overlay: "bg-black/50",
  content: "w-full gap-4 rounded-lg border border-border bg-background p-6",
  header: "gap-2",
  title: "text-lg leading-none font-semibold text-center",
  description: "text-muted-foreground text-sm text-center",
  /** Phones: buttons stacked full width, primary on top. */
  footer: "flex-col-reverse gap-2",
} as const;

/** Underlined tab list (web: components/ui/tabs). */
export const tabs = {
  list: "mb-6 flex-row items-center gap-6 border-b border-border",
  trigger: "-mb-px border-b-2 border-transparent pb-2.5",
  triggerActive: "border-primary",
  text: "text-sm font-semibold text-muted-foreground",
  textActive: "text-primary",
} as const;
