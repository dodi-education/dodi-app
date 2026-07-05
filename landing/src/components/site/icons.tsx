import type { CSSProperties, ReactNode } from "react";

/**
 * Inline SVG icon set, ported from the design markup. Shared across the home
 * page and the App / Companion / About pages. Each stroke icon takes an
 * optional `sw` (stroke width) so call sites can match the design exactly.
 */
export interface IconProps {
  sw?: number;
}

export function Stroke({
  sw = 1.8,
  style,
  children,
}: {
  sw?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {children}
    </svg>
  );
}

export function Sparkle({ sw = 1.9 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7L19 17z" />
    </Stroke>
  );
}

export function Check({ sw = 2.4 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <polyline points="20 6 9 17 4 12" />
    </Stroke>
  );
}

export function ArrowRight({ sw = 2.2 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Stroke>
  );
}

export function Mic({ sw = 1.9 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </Stroke>
  );
}

export function Globe({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Stroke>
  );
}

export function Shield({ sw = 1.9 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Stroke>
  );
}

/** Neutral/curious face (mouth curves down) — memory line 1, AI-keys mock. */
export function Smiley({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8s-1.5-2-4-2-4 2-4 2" />
      <line x1="9" y1="13" x2="9.01" y2="13" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <path d="M10 17h4" />
    </Stroke>
  );
}

/** Brain outline (Tabler-style) — "It learns them" step, learning/memory. */
export function Brain({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M15.5 13a3.5 3.5 0 0 0-3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8" />
      <path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1-7 0v-1.8" />
      <path d="M17.5 16a3.5 3.5 0 0 0 0-7h-.5" />
      <path d="M19 9.3v-2.8a3.5 3.5 0 0 0-7 0" />
      <path d="M6.5 16a3.5 3.5 0 0 1 0-7h.5" />
      <path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10" />
    </Stroke>
  );
}

/** Happy face (mouth curves up) — memory line 3, values, specs. */
export function SmileyHappy({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </Stroke>
  );
}

export function Gear({ sw = 1.7 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M19.4 7.9c-.05.32.06.65.29.88l1.57 1.57c.47.47.7 1.09.7 1.7s-.23 1.24-.7 1.7l-1.61 1.61a.98.98 0 0 1-.84.28c-.47-.07-.8-.48-.97-.93a2.5 2.5 0 1 0-3.21 3.22c.44.16.85.5.92.97a.98.98 0 0 1-.28.84l-1.61 1.61a2.4 2.4 0 0 1-1.7.7 2.4 2.4 0 0 1-1.7-.7l-1.57-1.57a1.03 1.03 0 0 0-.88-.29c-.49.07-.84.5-1.02.97a2.5 2.5 0 1 1-3.24-3.24c.46-.18.9-.53.97-1.02a1.03 1.03 0 0 0-.29-.88L2.7 13.7A2.4 2.4 0 0 1 2 12c0-.62.24-1.23.7-1.7l1.53-1.53c.24-.24.58-.35.92-.3.51.08.88.53 1.07 1.01a2.5 2.5 0 1 0 3.26-3.26c-.48-.2-.93-.56-1.01-1.07a1.03 1.03 0 0 1 .3-.92l1.53-1.52a2.4 2.4 0 0 1 1.7-.71c.62 0 1.23.24 1.7.71l1.57 1.57c.23.23.56.34.88.29.49-.08.84-.5 1.02-.97a2.5 2.5 0 1 1 3.24 3.24c-.47.18-.9.53-.97 1.02z" />
    </Stroke>
  );
}

export function Lock({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Stroke>
  );
}

export function Code({ sw = 1.9 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </Stroke>
  );
}

export function Key({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </Stroke>
  );
}

export function Eye({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </Stroke>
  );
}

export function Home({ sw = 1.9 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </Stroke>
  );
}

export function Clock({ sw = 2.2 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Stroke>
  );
}

export function Menu({ sw = 2.2 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </Stroke>
  );
}

export function Caret({ sw = 2.2 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <polyline points="6 9 12 15 18 9" />
    </Stroke>
  );
}

export function Gamepad({ sw = 1.7 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <line x1="17.5" y1="10.5" x2="17.51" y2="10.5" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59L2.7 8.74C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.41.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.54-.6-6.58-.69-7.26A4 4 0 0 0 17.32 5z" />
    </Stroke>
  );
}

/** Two-figure users icon (App "Friends", Companion "whole family"). */
export function Users({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M17 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M9 21v-2a4 4 0 0 1 4-4h-2a4 4 0 0 1 4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M16 4a3 3 0 0 1 0 6" />
    </Stroke>
  );
}

/** Group users icon (About "By families, for families"). */
export function UsersGroup({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Stroke>
  );
}

export function GameHeart({ sw = 1.7 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M12 8c0-4 3-5 3-5" />
      <path d="M12 8c0-2.5-2-4.5-4.5-4.5C5 3.5 3 6 3 9.5 3 15 7 21 10 21c1 0 1.5-.5 2-.5s1 .5 2 .5c3 0 7-6 7-11.5C21 6 19 3.5 16.5 3.5 14 3.5 12 5.5 12 8z" />
    </Stroke>
  );
}

export function Plus({ sw = 2.2 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Stroke>
  );
}

export function Play() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

export function Refresh({ sw = 2 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </Stroke>
  );
}

export function SendUp({ sw = 2 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <line x1="12" y1="20" x2="12" y2="5" />
      <polyline points="5 11 12 4 19 11" />
    </Stroke>
  );
}

export function Heart({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </Stroke>
  );
}

/** Heart with handshake (Tabler heart-handshake) — "self-improving companion" pillar. */
export function HeartHandshake({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M19.5 12.572 12 20l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572" />
      <path d="m12 6-3.293 3.293a1 1 0 0 0 0 1.414l.543.543c.69.69 1.81.69 2.5 0l1-1a3.182 3.182 0 0 1 4.5 0l2.25 2.25" />
      <path d="m12.5 15.5 2 2" />
      <path d="m15 13 2 2" />
    </Stroke>
  );
}

export function Sun({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" />
      <line x1="18.4" y1="18.4" x2="19.8" y2="19.8" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.2" y1="19.8" x2="5.6" y2="18.4" />
      <line x1="18.4" y1="5.6" x2="19.8" y2="4.2" />
    </Stroke>
  );
}

export function Moon({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Stroke>
  );
}

export function Music({ sw = 1.8 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Stroke>
  );
}

export function TrendingUp({ sw = 1.9 }: IconProps) {
  return (
    <Stroke sw={sw}>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </Stroke>
  );
}

export function Github({ style }: { style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}>
      <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.53 11.53 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5z" />
    </svg>
  );
}
