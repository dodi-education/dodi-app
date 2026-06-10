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
        "flex items-center justify-end gap-2.5 px-5 py-3.5",
        className,
      )}
    >
      {note ? (
        <span className="mr-auto text-[12.5px] text-success">{note}</span>
      ) : null}
      {children}
    </div>
  );
}
