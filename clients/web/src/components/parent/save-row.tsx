import { saveRow } from "@dodi/ui-recipes";
import { cn } from "@/lib/utils";

interface SaveRowProps {
  /** Feedback note shown left-aligned (e.g. "Changes saved"). */
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Section footer row holding save/cancel actions, right-aligned. */
export function SaveRow({ note, className, children }: SaveRowProps) {
  return (
    <div
      className={cn(
        saveRow.box,
        saveRow.web,
        className,
      )}
    >
      {note ? (
        <span className={saveRow.note}>{note}</span>
      ) : null}
      {children}
    </div>
  );
}
