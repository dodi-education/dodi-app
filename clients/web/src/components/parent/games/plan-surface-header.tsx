"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/shared/icon";

interface PlanSurfaceHeaderProps {
  title: string;
  backLabel: string;
  onBack: () => void;
  /** Right-aligned action, e.g. "Read my sketch" or the Modify toggle. */
  right?: ReactNode;
}

/**
 * Title row of a mobile Plan surface (sketch, plan): a back arrow that returns
 * to the conversation, the surface's name, and room for one action.
 */
export function PlanSurfaceHeader({ title, backLabel, onBack, right }: PlanSurfaceHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary"
      >
        <Icon name="arrow_left" size={18} />
      </button>
      <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{title}</h2>
      {right}
    </div>
  );
}
