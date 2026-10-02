import { speechBubble } from "@dodi/ui-recipes";

import { cn } from "@/lib/utils";

interface SpeechBubbleProps {
  children: React.ReactNode;
  className?: string;
}

export function SpeechBubble({ children, className }: SpeechBubbleProps) {
  return (
    <div
      className={cn(
        speechBubble.box,
        speechBubble.text,
        speechBubble.web,
        className,
      )}
      aria-live="polite"
    >
      {/* Tail pointing upward toward Dodi */}
      <div className={cn(speechBubble.tail, speechBubble.webTail)} />
      <div className={speechBubble.inner}>{children}</div>
    </div>
  );
}
