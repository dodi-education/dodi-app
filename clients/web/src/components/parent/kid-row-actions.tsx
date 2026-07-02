import Link from "next/link";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";

/**
 * Trailing quick-actions for a kid list row: Edit + Memory. Rendered as sibling
 * links (never nested inside the row's own link) so the markup stays valid.
 * Styled to match the sidebar's icon buttons.
 */
export function KidRowActions({ kidId }: { kidId: string }) {
  const t = useTranslations("kids");
  const cls =
    "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-primary";
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Link
        href={`/parent/kids/${kidId}`}
        aria-label={t("editTitle")}
        className={cls}
      >
        <Icon name="edit" size={16} />
      </Link>
      <Link
        href={`/parent/kids/${kidId}/memory`}
        aria-label={t("viewMemory")}
        className={cls}
      >
        <Icon name="memory" size={16} />
      </Link>
    </div>
  );
}
