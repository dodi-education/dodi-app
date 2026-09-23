/**
 * Measured layout check: which visible UI elements of a game cover or cut
 * into each other (a clock face over the progress bar, a button under a
 * header). A model looking at a JPEG misses these; measuring the DOM does
 * not.
 *
 * `probeLayout` runs INSIDE the game frame (serialized by Playwright, so it
 * must stay self-contained: no imports, no closures). It reports raw pairs;
 * `collectLayoutIssues` turns the pairs of every frame into a short,
 * de-duplicated list of readable lines for the agent.
 *
 * What counts as a UI element: interactive controls, media (img, canvas,
 * svg, video), elements with their own text, and elements with a visible box
 * (background, border or shadow). Skipped: page-sized layers (backgrounds,
 * containers), decoration that ignores the pointer and carries no text, and
 * anything inside `[data-overlap-ok]`, the game's way to mark an overlap as
 * intended. Ancestor/descendant pairs never count, and neither does a smaller
 * element sitting fully inside a bigger one on top of it (a label on a panel
 * is layering, not a collision).
 */

import { SCREENSHOT_LIMITS } from "@dodi/games/screenshot-contract";

export interface ProbedElement {
  /** e.g. `div#clock.clock-face "12"`. */
  name: string;
  /** Stable within one render: the element's DOM path. */
  path: string;
}

export interface ProbedOverlap {
  a: ProbedElement;
  b: ProbedElement;
  /** Which of the two is painted on top at the overlap's center, if either. */
  top: "a" | "b" | null;
  /** Overlap rectangle in CSS px. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProbeOptions {
  maxOverlaps: number;
}

/** Runs in the game frame. Keep it free of outer references. */
export function probeLayout(options: ProbeOptions): ProbedOverlap[] {
  const MIN_SIDE = 8;
  const MIN_OVERLAP_SIDE = 4;
  const MIN_OVERLAP_SHARE = 0.08;
  const MAX_SCANNED = 1500;
  const PAGE_LAYER_SHARE = 0.5;
  const INTERACTIVE = new Set([
    "BUTTON",
    "INPUT",
    "SELECT",
    "TEXTAREA",
    "PROGRESS",
    "METER",
    "IMG",
    "CANVAS",
    "VIDEO",
    "svg",
  ]);
  const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "BR", "HEAD", "META", "LINK"]);

  interface Candidate {
    el: Element;
    rect: { left: number; top: number; right: number; bottom: number };
    area: number;
    depth: number;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const viewArea = vw * vh;

  const hasOwnText = (el: Element): boolean => {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()) return true;
    }
    return false;
  };
  const hasVisibleBox = (style: CSSStyleDeclaration): boolean => {
    const bg = style.backgroundColor;
    const transparent = bg === "transparent" || /rgba\(.*,\s*0\)$/.test(bg);
    if (!transparent) return true;
    if (style.backgroundImage && style.backgroundImage !== "none") return true;
    if (style.boxShadow && style.boxShadow !== "none") return true;
    return ["Top", "Right", "Bottom", "Left"].some(
      (side) =>
        parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
        style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none",
    );
  };
  const depthOf = (el: Element): number => {
    let depth = 0;
    for (let node = el.parentElement; node; node = node.parentElement) depth++;
    return depth;
  };
  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
      const parent: Element | null = node.parentElement;
      const index = parent ? Array.from(parent.children).indexOf(node) : 0;
      parts.push(`${node.tagName}:${index}`);
    }
    return parts.reverse().join("/");
  };
  const nameOf = (el: Element): string => {
    let name = el.tagName.toLowerCase();
    if (el.id) name += `#${el.id}`;
    const classes = Array.from(el.classList).slice(0, 2);
    if (classes.length) name += `.${classes.join(".")}`;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) name += ` "${text.length > 24 ? `${text.slice(0, 23)}…` : text}"`;
    return name;
  };

  const candidates: Candidate[] = [];
  const all = document.body ? Array.from(document.body.querySelectorAll("*")) : [];
  for (const el of all.slice(0, MAX_SCANNED)) {
    if (SKIP.has(el.tagName)) continue;
    // Inside an svg only the outer <svg> counts; its shapes are one picture.
    if (el.tagName !== "svg" && el.closest("svg")) continue;
    if (el.closest("[data-overlap-ok]")) continue;
    const visible = (
      el as Element & { checkVisibility?: (o: Record<string, boolean>) => boolean }
    ).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true });
    if (visible === false) continue;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const rect = {
      left: Math.max(0, box.left),
      top: Math.max(0, box.top),
      right: Math.min(vw, box.right),
      bottom: Math.min(vh, box.bottom),
    };
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    if (width < MIN_SIDE || height < MIN_SIDE) continue;
    const area = width * height;
    if (area > viewArea * PAGE_LAYER_SHARE) continue;
    const text = hasOwnText(el);
    const interactive =
      INTERACTIVE.has(el.tagName) ||
      el.getAttribute("role") === "button" ||
      el.getAttribute("role") === "progressbar" ||
      (el.tagName === "A" && el.hasAttribute("href"));
    if (style.pointerEvents === "none" && !text && !interactive) continue;
    if (!text && !interactive && !hasVisibleBox(style)) continue;
    candidates.push({ el, rect, area, depth: depthOf(el) });
  }

  interface Found extends ProbedOverlap {
    aEl: Element;
    bEl: Element;
    depth: number;
  }
  const found: Found[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const left = Math.max(a.rect.left, b.rect.left);
      const top = Math.max(a.rect.top, b.rect.top);
      const width = Math.min(a.rect.right, b.rect.right) - left;
      const height = Math.min(a.rect.bottom, b.rect.bottom) - top;
      if (width < MIN_OVERLAP_SIDE || height < MIN_OVERLAP_SIDE) continue;
      const overlap = width * height;
      if (overlap < MIN_OVERLAP_SHARE * Math.min(a.area, b.area)) continue;
      const hit = document.elementFromPoint(left + width / 2, top + height / 2);
      const onTop: "a" | "b" | null =
        hit && (a.el === hit || a.el.contains(hit))
          ? "a"
          : hit && (b.el === hit || b.el.contains(hit))
            ? "b"
            : null;
      // A smaller element fully inside a bigger one and painted over it is
      // deliberate layering (a label on a card), not a collision.
      const [small, big, smallKey] = a.area <= b.area ? [a, b, "a"] : [b, a, "b"];
      const inside =
        small.rect.left >= big.rect.left &&
        small.rect.top >= big.rect.top &&
        small.rect.right <= big.rect.right &&
        small.rect.bottom <= big.rect.bottom;
      if (inside && onTop === smallKey) continue;
      found.push({
        a: { name: nameOf(a.el), path: pathOf(a.el) },
        b: { name: nameOf(b.el), path: pathOf(b.el) },
        top: onTop,
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
        aEl: a.el,
        bEl: b.el,
        depth: a.depth + b.depth,
      });
    }
  }

  // Outermost pairs first, then drop pairs that are just parts of an already
  // reported pair (the clock's numbers over the progress bar's fill, ...).
  found.sort((x, y) => x.depth - y.depth || y.width * y.height - x.width * x.height);
  const reported: Found[] = [];
  const within = (outer: Element, inner: Element): boolean => outer === inner || outer.contains(inner);
  for (const pair of found) {
    const covered = reported.some(
      (r) =>
        (within(r.aEl, pair.aEl) && within(r.bEl, pair.bEl)) ||
        (within(r.aEl, pair.bEl) && within(r.bEl, pair.aEl)),
    );
    if (covered) continue;
    reported.push(pair);
    if (reported.length >= options.maxOverlaps) break;
  }
  return reported.map(({ a, b, top, x, y, width, height }) => ({ a, b, top, x, y, width, height }));
}

/**
 * The probe as a self-contained expression for `frame.evaluate`. Passing the
 * function itself breaks under tsx (how the worker runs): esbuild's keepNames
 * wraps its inner functions in a `__name(...)` helper that does not exist in
 * the page. Defining a no-op `__name` around the source works either way.
 */
export function probeLayoutScript(options: ProbeOptions): string {
  return `(() => { const __name = (fn) => fn; return (${probeLayout.toString()})(${JSON.stringify(options)}); })()`;
}

/**
 * One readable line per colliding pair across all frames, e.g.
 * `div.clock covers div.progress "…" (240×12 px at 118,124), frames 1, 2`.
 * The same pair in several frames is reported once. Bounded by the contract.
 */
export function collectLayoutIssues(perFrame: ProbedOverlap[][], frameLabels: string[]): string[] {
  const byPair = new Map<string, { overlap: ProbedOverlap; frames: number[] }>();
  perFrame.forEach((overlaps, frameIndex) => {
    for (const overlap of overlaps) {
      const key = [overlap.a.path, overlap.b.path].sort().join("|");
      const entry = byPair.get(key);
      if (entry) {
        if (!entry.frames.includes(frameIndex)) entry.frames.push(frameIndex);
      } else {
        byPair.set(key, { overlap, frames: [frameIndex] });
      }
    }
  });
  const lines: string[] = [];
  for (const { overlap, frames } of byPair.values()) {
    const { a, b, top } = overlap;
    const relation =
      top === "a" ? `${a.name} covers ${b.name}` : top === "b" ? `${b.name} covers ${a.name}` : `${a.name} overlaps ${b.name}`;
    const where = `${overlap.width}×${overlap.height} px at ${overlap.x},${overlap.y}`;
    const shownIn = frames.map((i) => `${i + 1} (${frameLabels[i] ?? "?"})`).join(", ");
    const line = `${relation} (${where}), frame${frames.length > 1 ? "s" : ""} ${shownIn}`;
    lines.push(line.slice(0, SCREENSHOT_LIMITS.MAX_ERROR_CHARS));
    if (lines.length >= SCREENSHOT_LIMITS.MAX_LAYOUT_ISSUES) break;
  }
  return lines;
}
