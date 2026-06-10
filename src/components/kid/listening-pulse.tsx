import { cn } from "@/lib/utils";

interface ListeningPulseProps {
  /** Inset of the pulse circles relative to the mascot wrapper. */
  className?: string;
}

/**
 * Two soft radial pulses behind the Dodi mascot while she is listening.
 * Render inside a `relative` wrapper around the mascot image.
 */
export function ListeningPulse({ className }: ListeningPulseProps) {
  const gradient = {
    background:
      "radial-gradient(circle, rgba(95,155,216,0.22) 0%, rgba(95,155,216,0) 70%)",
  };
  return (
    <>
      <div
        className={cn("animate-kpulse absolute inset-6 rounded-full", className)}
        style={gradient}
        aria-hidden
      />
      <div
        className={cn(
          "animate-kpulse-2 absolute inset-6 rounded-full",
          className,
        )}
        style={gradient}
        aria-hidden
      />
    </>
  );
}
