import { cn } from "@/lib/utils";

import { RequiredMark } from "./rows";

interface PageHeadProps {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}

export function PageHead({ title, sub, action }: PageHeadProps) {
  return (
    <div className="mb-7 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {sub ? (
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{sub}</p>
        ) : null}
      </div>
      {action ?? null}
    </div>
  );
}

interface SectionProps {
  title?: string;
  desc?: string;
  action?: React.ReactNode;
  className?: string;
  required?: boolean;
  children: React.ReactNode;
}

/** Flat section: heading lives OUTSIDE the card; the card holds only rows. */
export function Section({
  title,
  desc,
  action,
  className,
  required,
  children,
}: SectionProps) {
  return (
    <div className={cn("mb-8", className)}>
      {title ? (
        <div className="mb-2.5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {title}
              {required ? <RequiredMark /> : null}
            </h2>
            {desc ? (
              <p className="mt-0.5 text-[13px] text-muted-foreground">{desc}</p>
            ) : null}
          </div>
          {action ?? null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border bg-card shadow-card [&>*+*]:border-t [&>*+*]:border-border">
        {children}
      </div>
    </div>
  );
}
