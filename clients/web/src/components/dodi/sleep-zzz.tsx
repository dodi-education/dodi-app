import type { CSSProperties } from "react";

// Three staggered "z"s on the same drifting path; with reduced motion they
// stand still along it instead (at `offset`).
const LETTERS = [
  { delay: "0s", offset: "0em 0em", size: "text-base" },
  { delay: "1s", offset: "0.6em -0.9em", size: "text-lg" },
  { delay: "2s", offset: "1.2em -1.8em", size: "text-xl" },
] as const;

/**
 * Sleepy "z"s drifting up above the 3D character's head. Decorative: the
 * figure's own label already says dodi is asleep.
 */
export function SleepZzz() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-[60%] top-[4%] font-extrabold text-dodi-700">
      {LETTERS.map((letter) => (
        <span
          key={letter.delay}
          className={`absolute ${letter.size} animate-kzzz opacity-0 motion-reduce:opacity-80 motion-reduce:[translate:var(--zzz-offset)]`}
          style={{ animationDelay: letter.delay, "--zzz-offset": letter.offset } as CSSProperties}
        >
          z
        </span>
      ))}
    </div>
  );
}
