import { cn } from "@/lib/utils";

interface RowProps extends React.ComponentProps<"div"> {
  clickable?: boolean;
}

/** Hairline-divided list row inside a Section. */
export function Row({ clickable, className, children, ...props }: RowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 px-5 py-3.5",
        clickable && "transition-colors hover:bg-[#FAFCFE]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function RowMain({
  className,
  children,
}: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0 flex-1", className)}>{children}</div>;
}

export function RowTitle({
  className,
  children,
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm font-semibold",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function RowMeta({ className, children }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mt-0.5 text-[12.5px] text-muted-foreground", className)}>
      {children}
    </div>
  );
}

/** Separator dot between meta segments. */
export function DotSep() {
  return <span className="mx-1.5 text-border-strong">·</span>;
}

/** Subtle red asterisk marking a mandatory field. Decorative — fields carry
 *  `aria-required` for assistive tech, so this is hidden from screen readers. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive/70">
      *
    </span>
  );
}

interface FieldRowProps {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  required?: boolean;
  children: React.ReactNode;
}

/** Settings-style row: label left, control right. */
export function FieldRow({
  label,
  hint,
  htmlFor,
  className,
  required,
  children,
}: FieldRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div>
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
          {required ? <RequiredMark /> : null}
        </label>
        {hint ? (
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            {hint}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">{children}</div>
    </div>
  );
}

/** Full-width field block (textareas, memory blocks). */
export function StackField({
  className,
  children,
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("px-5 py-3.5 pb-4", className)}>{children}</div>
  );
}
