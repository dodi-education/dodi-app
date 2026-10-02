"use client";

import { AGE_MAX, AGE_MIN, isValidAgeRange } from "@dodi/studio/age-range";
import { ageRange } from "@dodi/ui-recipes";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// The validation rules are shared (core/studio); re-exported for the forms.
export { AGE_MAX, AGE_MIN, isValidAgeRange };

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
  return (
    <div className={cn(ageRange.webRow, ageRange.row)}>
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
        className={cn(ageRange.field, invalid && ageRange.invalid)}
      />
      <span aria-hidden className={ageRange.dash}>
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
        className={cn(ageRange.field, invalid && ageRange.invalid)}
      />
    </div>
  );
}
