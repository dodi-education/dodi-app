import { pageActions, section } from "@dodi/ui-recipes";
import { cn } from "@/lib/utils";

import { RequiredMark } from "./rows";

/** Right-aligned toolbar row for a page's primary action(s), sits above the
 * first Section. The page title now lives in the top-bar breadcrumb. */
export function PageActions({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(pageActions, "flex")}>{children}</div>
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
    <div className={cn(section.root, className)}>
      {title ? (
        <div className={cn(section.head, "flex")}>
          <div>
            <h2 className={section.title}>
              {title}
              {required ? <RequiredMark /> : null}
            </h2>
            {desc ? (
              <p className={section.description}>{desc}</p>
            ) : null}
          </div>
          {action ?? null}
        </div>
      ) : null}
      <div className={cn(section.card, section.web)}>
        {children}
      </div>
    </div>
  );
}
