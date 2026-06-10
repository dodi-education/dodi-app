import Link from "next/link";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

interface BackLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export function BackLink({ href, className, children }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary",
        className,
      )}
    >
      <Icon name="arrow_left" size={14} stroke={2.2} />
      {children}
    </Link>
  );
}
