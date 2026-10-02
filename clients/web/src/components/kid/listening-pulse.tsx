import { listeningPulse as p } from "@dodi/ui-recipes";

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
    background: `radial-gradient(circle, rgba(${p.rgb},${p.centerOpacity}) 0%, rgba(${p.rgb},0) ${p.fadeStopPercent}%)`,
  };
  return (
    <>
      <div
        className={cn(p.webFirst, p.circle, className)}
        style={gradient}
        aria-hidden
      />
      <div
        className={cn(p.webSecond, p.circle, className)}
        style={gradient}
        aria-hidden
      />
    </>
  );
}
