import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { cn } from "@/lib/utils";

/**
 * Persistent top bar for every `/parent/*` page. In `wide` its vertical metrics
 * mirror the sidebar header (`pt-5` + a 36px row + `pb-4` → 72px tall, content
 * centered at y=38) so the breadcrumb lines up with the logo and gear across the
 * top. In `compact` it stacks directly beneath the mobile header (`top-14`).
 *
 * Height reference: `PARENT_TOP_BAR_H` — the Game Studio overlay offsets by it.
 */
export const PARENT_TOP_BAR_H = { wide: 72, compact: 60 } as const;

export function ParentTopBar({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-14 z-30 border-b bg-sidebar px-4 py-3 wide:top-0 wide:px-12 wide:pt-5 wide:pb-4",
        className,
      )}
    >
      <div className="flex min-h-9 items-center">{children ?? <Breadcrumbs />}</div>
    </header>
  );
}
