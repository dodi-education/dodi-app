import { backLink } from "@dodi/ui-recipes";
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
        backLink.box,
        backLink.text,
        backLink.web,
        className,
      )}
    >
      <Icon name="arrow_left" size={backLink.icon.size} stroke={backLink.icon.stroke} />
      {children}
    </Link>
  );
}
