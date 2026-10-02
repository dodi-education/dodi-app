import { fieldRow, fieldSelect, requiredMark, row, stackField } from "@dodi/ui-recipes";
import { cn } from "@/lib/utils";

interface RowProps extends React.ComponentProps<"div"> {
  clickable?: boolean;
}

/** Hairline-divided list row inside a Section. */
export function Row({ clickable, className, children, ...props }: RowProps) {
  return (
    <div
      className={cn(
        row.box,
        row.web,
        clickable && row.webClickable,
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
  return <div className={cn(row.main, className)}>{children}</div>;
}

export function RowTitle({
  className,
  children,
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(row.title, "flex", row.titleText, className)}
    >
      {children}
    </div>
  );
}

export function RowMeta({ className, children }: React.ComponentProps<"div">) {
  return (
    <div className={cn(row.meta, className)}>
      {children}
    </div>
  );
}

/** Separator dot between meta segments. */
export function DotSep() {
  return <span className={row.dot}>·</span>;
}

/** Subtle red asterisk marking a mandatory field. Decorative — fields carry
 *  `aria-required` for assistive tech, so this is hidden from screen readers. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className={requiredMark}>
      *
    </span>
  );
}

/** Select styled to match the inputs inside a FieldRow. */
export const fieldSelectClass = cn(fieldSelect.box, fieldSelect.text, fieldSelect.web);

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
        fieldRow.box,
        fieldRow.web,
        className,
      )}
    >
      <div>
        <label htmlFor={htmlFor} className={fieldRow.label}>
          {label}
          {required ? <RequiredMark /> : null}
        </label>
        {hint ? (
          <div className={fieldRow.hint}>
            {hint}
          </div>
        ) : null}
      </div>
      <div className={cn(fieldRow.control, fieldRow.webControl)}>{children}</div>
    </div>
  );
}

/** Full-width field block (textareas, memory blocks). */
export function StackField({
  className,
  children,
}: React.ComponentProps<"div">) {
  return (
    <div className={cn(stackField, className)}>{children}</div>
  );
}
