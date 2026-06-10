import { cn } from "@/lib/utils";

export function StatStrip({
  className,
  children,
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 divide-x divide-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface StatCellProps {
  num: React.ReactNode;
  label: string;
}

export function StatCell({ num, label }: StatCellProps) {
  return (
    <div className="p-5">
      <div className="text-2xl font-bold tracking-tight">{num}</div>
      <div className="mt-1 text-[12.5px] text-muted-foreground">{label}</div>
    </div>
  );
}
