import { cn } from "@/lib/utils";

interface SpeechBubbleProps {
  children: React.ReactNode;
  className?: string;
}

export function SpeechBubble({ children, className }: SpeechBubbleProps) {
  return (
    <div
      className={cn(
        "relative rounded-[18px] bg-white px-7 py-3 font-bold text-ink-2 shadow-[0_4px_16px_rgba(34,56,78,0.08)]",
        className,
      )}
      aria-live="polite"
    >
      {/* Tail pointing upward toward Dodi */}
      <div className="absolute -top-[7px] left-1/2 size-3.5 -translate-x-1/2 rotate-45 rounded-[3px] bg-white" />
      <div className="relative">{children}</div>
    </div>
  );
}
