"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * A bottom sheet: a modal that slides up from the bottom edge, the way a
 * phone offers a short list of choices. Same Radix primitive as the dialog,
 * anchored differently.
 *
 * Free-standing, it spans the bottom of the viewport (a centered card on wide
 * screens). Given an `anchorRef`, it takes that element's footprint instead:
 * same left edge and width, its bottom on the element's bottom, and at least
 * as tall, so it covers the element it belongs to (the chat composer).
 */
function Sheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

type AnchorBox = Pick<React.CSSProperties, "left" | "width" | "bottom" | "minHeight">;

function measure(el: HTMLElement): AnchorBox {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    width: rect.width,
    bottom: Math.max(0, window.innerHeight - rect.bottom),
    minHeight: rect.height,
  };
}

function SheetContent({
  className,
  children,
  anchorRef,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Element whose footprint the sheet takes (see the module note). */
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  const [box, setBox] = React.useState<AnchorBox | null>(null);

  // The content mounts on open, so this measures then, before first paint,
  // and follows the window afterwards (resize, rotation).
  React.useLayoutEffect(() => {
    const el = anchorRef?.current;
    if (!el) return;
    const update = (): void => setBox(measure(el));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchorRef]);

  const anchored = anchorRef !== undefined;

  return (
    <DialogPrimitive.Portal data-slot="sheet-portal">
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        style={box ?? undefined}
        className={cn(
          "fixed z-50 flex flex-col gap-3 rounded-t-2xl border border-border bg-card px-4 pt-3 shadow-[0_-8px_28px_rgba(34,56,78,0.14)] outline-none",
          "pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
          "duration-300 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
          anchored
            ? // Placed by the measured box; unseen until that has happened.
              !box && "invisible"
            : "inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:rounded-2xl sm:pb-4",
          className,
        )}
        {...props}
      >
        {/* Grab handle: the visual cue that this came up from the edge. */}
        <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border-strong" />
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-[15px] font-bold text-ink", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-[12.5px] leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Sheet, SheetContent, SheetDescription, SheetTitle };
