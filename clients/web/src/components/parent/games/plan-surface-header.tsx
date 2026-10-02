"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";
import { planSurface } from "@dodi/ui-recipes";

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
    <div className={cn(planSurface.webHeader, planSurface.header)}>
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
        className={cn(planSurface.back, planSurface.webBack)}
      >
        <Icon name="arrow_left" size={18} />
      </button>
      <h2 className={cn(planSurface.title, planSurface.webTitle)}>{title}</h2>
      {right}
    </div>
  );
}
