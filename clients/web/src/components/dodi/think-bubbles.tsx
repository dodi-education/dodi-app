import type { CSSProperties } from "react";
import { thinkBubbles as b } from "@dodi/ui-recipes";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

// Each part pops in after the one before; with reduced motion they just show.
const POP = "animate-in fade-in zoom-in-50 duration-300 fill-mode-both motion-reduce:animate-none";

function delay(step: number): CSSProperties {
  return { animationDelay: `${step * b.staggerMs}ms` };
}

/**
 * Thought bubbles above the 3D character while it thinks (writing a trick,
 * answering with the thinking model): two puffs rising to a bubble with a
 * turning gear. Decorative: the figure's own label says what it is doing.
 */
export function ThinkBubbles() {
  return (
    <div aria-hidden className={cn("pointer-events-none", b.root)}>
      <span className={cn(b.puffSmall, POP)} style={delay(0)} />
      <span className={cn(b.puffMedium, POP)} style={delay(1)} />
      <span className={cn(b.bubble, b.webBubble, POP)} style={delay(2)}>
        <Icon
          name="settings"
          size={b.gearSize}
          className={cn(b.gearColor, "animate-spin motion-reduce:animate-none")}
          style={{ animationDuration: `${b.spinMs}ms` }}
        />
      </span>
    </div>
  );
}
