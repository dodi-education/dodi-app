"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires when the last digit completes the code. */
  onComplete?: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  /** Accessible label prefix per cell, e.g. "PIN digit". */
  ariaLabel?: string;
}

/**
 * Fixed-length numeric PIN entry rendered as separate masked cells. The value is
 * kept as a STRING (never numeric) so leading zeros survive. Supports
 * auto-advance, backspace-to-previous, arrow keys, and pasting the whole code.
 */
export function PinInput({
  value,
  onChange,
  onComplete,
  length = 4,
  autoFocus = false,
  disabled = false,
  error = false,
  ariaLabel = "PIN digit",
}: PinInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  // After a failed attempt the consumer clears the value and raises `error`;
  // return focus to the first cell so the user can retry from the start.
  useEffect(() => {
    if (error) refs.current[0]?.focus();
  }, [error]);

  function handleChange(index: number, raw: string) {
    // Newest digit only (handles replace/autofill); empty ⇒ deletion in-cell.
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = (
      value.slice(0, index) +
      digit +
      value.slice(index + 1)
    ).slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !cells[index] && index > 0) {
      // Empty cell: hop back and clear the previous digit.
      e.preventDefault();
      refs.current[index - 1]?.focus();
      onChange(value.slice(0, index - 1) + value.slice(index));
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
    refs.current[Math.min(next.length, length - 1)]?.focus();
  }

  return (
    <div
      className={cn("flex justify-center gap-2.5", error && "animate-pin-shake")}
    >
      {cells.map((cell, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          maxLength={1}
          value={cell}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          aria-label={`${ariaLabel} ${index + 1}`}
          aria-invalid={error}
          className={cn(
            "h-14 w-12 rounded-md border bg-card text-center text-2xl font-semibold outline-none transition-[color,box-shadow,border-color]",
            "focus-visible:border-primary focus-visible:ring-primary-soft-2 focus-visible:ring-2",
            "disabled:pointer-events-none disabled:opacity-50",
            error ? "border-destructive" : "border-input hover:border-faint",
          )}
        />
      ))}
    </div>
  );
}
