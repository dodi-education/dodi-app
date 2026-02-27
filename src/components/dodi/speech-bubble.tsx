import { cn } from "@/lib/utils";

interface SpeechBubbleProps {
  children: React.ReactNode;
  className?: string;
}

export function SpeechBubble({ children, className }: SpeechBubbleProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-dodi-200 bg-white px-5 py-4 shadow-sm",
        className,
      )}
      aria-live="polite"
    >
      {children}
      {/* Tail pointing upward toward Dodi */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
        <div className="h-0 w-0 border-x-8 border-b-8 border-x-transparent border-b-white" />
        <div className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-[9px] border-b-[9px] border-x-transparent border-b-dodi-200" style={{ top: "-1px", zIndex: -1 }} />
      </div>
    </div>
  );
}
