"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Inclusive bounds a game's recommended-age range may take (mirrors the API). */
export const AGE_MIN = 1;
export const AGE_MAX = 25;

/** True when a min/max pair is in range and correctly ordered (min ≤ max). */
export function isValidAgeRange(min: number, max: number): boolean {
  return (
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= AGE_MIN &&
    max <= AGE_MAX &&
    min <= max
  );
}

interface AgeRangeProps {
  min: number;
  max: number;
  /** Receives the raw parsed value — `NaN` while a field is being cleared. */
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  minLabel: string;
  maxLabel: string;
  disabled?: boolean;
}

/** Two small number inputs rendered as "min – max" for a recommended age range. */
export function AgeRange({
  min,
  max,
  onMinChange,
  onMaxChange,
  minLabel,
  maxLabel,
  disabled,
}: AgeRangeProps) {
  const invalid = !isValidAgeRange(min, max);
  const field = "w-16 text-center";
  return (
    <div className="flex items-center gap-2.5">
      <Input
        type="number"
        inputMode="numeric"
        min={AGE_MIN}
        max={AGE_MAX}
        value={Number.isFinite(min) ? min : ""}
        aria-label={minLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onChange={(e) => onMinChange(e.target.valueAsNumber)}
        className={cn(field, invalid && "border-destructive")}
      />
      <span aria-hidden className="text-sm font-medium text-muted-foreground">
        –
      </span>
      <Input
        type="number"
        inputMode="numeric"
        min={AGE_MIN}
        max={AGE_MAX}
        value={Number.isFinite(max) ? max : ""}
        aria-label={maxLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onChange={(e) => onMaxChange(e.target.valueAsNumber)}
        className={cn(field, invalid && "border-destructive")}
      />
    </div>
  );
}
