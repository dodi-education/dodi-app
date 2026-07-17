/**
 * Curated character stroke paths — the "how to write it" dataset for tracing /
 * handwriting games. For every supported character it provides the strokes in
 * CORRECT pedagogical order and direction (German school print convention:
 * Druckschrift/Grundschrift-style — top→bottom, left→right, round shapes
 * counter-clockwise, umlaut dots last).
 *
 * Modeled on Hanzi Writer's data idea (per-stroke median centerlines) but
 * hand-curated for Latin letters, digits, and German umlauts. Geometry lives in
 * a 100x100 box, y grows downward:
 *   cap/ascender top y=10 · x-height top y=45 · baseline y=80 · descender y=98
 *   (umlaut dots sit above the cap line).
 *
 * Consumed by the generation agent via the read_char_paths tool — games embed
 * the data and validate the child's strokes against it (order + direction +
 * corridor), instead of inventing letterform geometry.
 */

export type CharStrokePoint = [number, number];
export type CharStrokes = CharStrokePoint[][];

export const CHAR_STROKE_COORDS = {
  box: 100,
  capTop: 10,
  xHeightTop: 45,
  baseline: 80,
  descender: 98,
  convention: "german-school-print",
} as const;

const rnd = (v: number): number => Math.round(v * 10) / 10;

/** Straight segment from (x1,y1) to (x2,y2), sampled into `steps + 1` points. */
function line(x1: number, y1: number, x2: number, y2: number, steps = 3): CharStrokePoint[] {
  const pts: CharStrokePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    pts.push([rnd(x1 + ((x2 - x1) * i) / steps), rnd(y1 + ((y2 - y1) * i) / steps)]);
  }
  return pts;
}

/**
 * Elliptic arc around (cx,cy). Angles in degrees with y-DOWN screen coords:
 * 0° = right, 90° = bottom, -90°/270° = top. Increasing angles sweep clockwise
 * on screen; decreasing sweep counter-clockwise (the usual writing direction
 * for round letters).
 */
function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fromDeg: number,
  toDeg: number,
  steps = 8,
): CharStrokePoint[] {
  const pts: CharStrokePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    pts.push([rnd(cx + rx * Math.cos(a)), rnd(cy + ry * Math.sin(a))]);
  }
  return pts;
}

/** Concatenate segments into one stroke, dropping duplicated joint points. */
function join(...segments: CharStrokePoint[][]): CharStrokePoint[] {
  const out: CharStrokePoint[] = [];
  for (const seg of segments) {
    for (const p of seg) {
      const last = out[out.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > 0.4 || Math.abs(last[1] - p[1]) > 0.4) out.push(p);
    }
  }
  return out;
}

/** An i/umlaut dot as a tiny downward stroke. */
const dot = (x: number, y: number): CharStrokePoint[] => [
  [x, y],
  [x, y + 2.5],
];

/** Umlaut variant: the base glyph's strokes, then the two dots (left → right). */
function withUmlautDots(base: CharStrokes, y: number): CharStrokes {
  return [...base, dot(41, y), dot(59, y)];
}

// ─── Capitals (y 10..80) ────────────────────────────────────────────────────

const CAPITALS: Record<string, CharStrokes> = {
  // Up-stroke first: bottom-left → apex, then apex → bottom-right, then crossbar.
  A: [line(27, 80, 50, 10), line(50, 10, 73, 80), line(35, 55, 65, 55, 2)],
  B: [
    line(30, 10, 30, 80, 4),
    join(
      line(30, 10, 52, 10, 1),
      arc(52, 27.5, 19, 17.5, -90, 90, 6),
      line(52, 45, 30, 45, 1),
      line(30, 45, 55, 45, 1),
      arc(55, 62.5, 19, 17.5, -90, 90, 6),
      line(55, 80, 30, 80, 1),
    ),
  ],
  C: [arc(52, 45, 24, 35, -60, -300, 10)],
  D: [
    line(30, 10, 30, 80, 4),
    join(line(30, 10, 45, 10, 1), arc(45, 45, 28, 35, -90, 90, 8), line(45, 80, 30, 80, 1)),
  ],
  E: [
    line(30, 10, 30, 80, 4),
    line(30, 10, 70, 10, 2),
    line(30, 45, 62, 45, 2),
    line(30, 80, 70, 80, 2),
  ],
  F: [line(30, 10, 30, 80, 4), line(30, 10, 70, 10, 2), line(30, 45, 60, 45, 2)],
  G: [join(arc(50, 45, 24, 35, -60, -330, 11), line(70.8, 62.5, 70.8, 60, 1)), line(50, 60, 71, 60, 2)],
  H: [line(30, 10, 30, 80, 4), line(70, 10, 70, 80, 4), line(30, 45, 70, 45, 2)],
  I: [line(50, 10, 50, 80, 4)],
  J: [join(line(58, 10, 58, 66, 3), arc(45, 66, 13, 13, 0, 150, 5))],
  K: [line(32, 10, 32, 80, 4), join(line(70, 10, 34, 45, 3), line(34, 45, 72, 80, 3))],
  L: [line(32, 10, 32, 80, 4), line(32, 80, 70, 80, 2)],
  M: [
    line(28, 10, 28, 80, 4),
    join(line(28, 10, 50, 58, 3), line(50, 58, 72, 10, 3), line(72, 10, 72, 80, 3)),
  ],
  N: [line(30, 10, 30, 80, 4), join(line(30, 10, 70, 80, 4), line(70, 80, 70, 10, 3))],
  O: [arc(50, 45, 24, 35, -90, -450, 12)],
  P: [
    line(30, 10, 30, 80, 4),
    join(line(30, 10, 52, 10, 1), arc(52, 29, 20, 19, -90, 90, 6), line(52, 48, 30, 48, 1)),
  ],
  Q: [arc(50, 45, 24, 35, -90, -450, 12), line(60, 64, 76, 84, 2)],
  R: [
    line(30, 10, 30, 80, 4),
    join(
      line(30, 10, 52, 10, 1),
      arc(52, 28, 20, 18, -90, 90, 6),
      line(52, 46, 32, 46, 1),
      line(32, 46, 70, 80, 3),
    ),
  ],
  S: [
    [
      [66, 18],
      [56, 11],
      [42, 11],
      [33, 17],
      [31, 26],
      [36, 35],
      [48, 42],
      [60, 49],
      [67, 58],
      [66, 69],
      [57, 78],
      [42, 80],
      [31, 74],
      [27, 66],
    ],
  ],
  T: [line(28, 10, 72, 10, 2), line(50, 10, 50, 80, 4)],
  U: [join(line(30, 10, 30, 60, 3), arc(50, 60, 20, 20, 180, 0, 6), line(70, 60, 70, 10, 3))],
  V: [join(line(28, 10, 50, 80, 3), line(50, 80, 72, 10, 3))],
  W: [
    join(
      line(24, 10, 38, 80, 3),
      line(38, 80, 50, 30, 2),
      line(50, 30, 62, 80, 2),
      line(62, 80, 76, 10, 3),
    ),
  ],
  X: [line(30, 10, 70, 80, 3), line(70, 10, 30, 80, 3)],
  Y: [line(30, 10, 50, 45, 2), join(line(70, 10, 50, 45, 2), line(50, 45, 50, 80, 2))],
  Z: [join(line(30, 10, 70, 10, 2), line(70, 10, 30, 80, 3), line(30, 80, 70, 80, 2))],
};

// ─── Lowercase (x-height 45..80, ascenders from 10, descenders to 98) ───────

const LOWERCASE: Record<string, CharStrokes> = {
  a: [arc(47, 62.5, 17, 17.5, -50, -410, 10), line(64, 45, 64, 80, 3)],
  b: [line(32, 10, 32, 80, 4), arc(48, 62.5, 16, 17.5, -140, 140, 8)],
  c: [arc(50, 62.5, 17, 17.5, -55, -305, 8)],
  d: [arc(47, 62.5, 17, 17.5, -50, -410, 10), line(64, 10, 64, 80, 4)],
  e: [join(line(33, 57, 65.5, 57, 2), arc(49, 62.5, 16.5, 17.5, -19, -319, 9))],
  f: [
    [
      [62, 17],
      [57, 11],
      [48, 10],
      [42, 15],
      [41, 24],
      [41, 52],
      [41, 80],
    ],
    line(32, 45, 56, 45, 2),
  ],
  g: [
    arc(47, 62.5, 17, 17.5, -50, -410, 10),
    join(line(64, 45, 64, 88, 3), arc(51, 88, 13, 9, 0, 120, 4)),
  ],
  h: [line(32, 10, 32, 80, 4), join(arc(46, 58, 14, 13, 180, 360, 6), line(60, 58, 60, 80, 2))],
  i: [line(50, 45, 50, 80, 3), dot(50, 31)],
  j: [join(line(54, 45, 54, 88, 3), arc(41, 88, 13, 9, 0, 120, 4)), dot(54, 31)],
  k: [line(32, 10, 32, 80, 4), join(line(62, 45, 34, 62, 2), line(34, 62, 64, 80, 2))],
  l: [line(50, 10, 50, 80, 4)],
  m: [
    line(28, 45, 28, 80, 3),
    join(arc(38, 59, 10, 14, 180, 360, 5), line(48, 59, 48, 80, 2)),
    join(arc(58, 59, 10, 14, 180, 360, 5), line(68, 59, 68, 80, 2)),
  ],
  n: [line(33, 45, 33, 80, 3), join(arc(48, 60, 15, 15, 180, 360, 6), line(63, 60, 63, 80, 2))],
  o: [arc(50, 62.5, 17, 17.5, -90, -450, 10)],
  p: [line(33, 45, 33, 98, 4), arc(48, 62.5, 16, 17.5, -140, 140, 8)],
  q: [
    arc(47, 62.5, 17, 17.5, -50, -410, 10),
    join(line(64, 45, 64, 94, 3), line(64, 94, 70, 98, 1)),
  ],
  r: [line(36, 45, 36, 80, 3), arc(48, 58, 12, 13, 180, 300, 4)],
  s: [
    [
      [61, 50],
      [54, 45],
      [45, 45],
      [38, 49],
      [37, 55],
      [42, 60],
      [50, 63],
      [58, 66],
      [62, 71],
      [60, 77],
      [52, 80],
      [43, 80],
      [36, 76],
    ],
  ],
  t: [join(line(46, 28, 46, 73, 3), [[48, 78] as CharStrokePoint, [54, 80] as CharStrokePoint]), line(34, 45, 60, 45, 2)],
  u: [
    join(line(34, 45, 34, 66, 2), arc(46, 66, 12, 13, 180, 0, 5), line(58, 66, 58, 45, 2)),
    line(58, 45, 58, 80, 3),
  ],
  v: [join(line(32, 45, 50, 80, 2), line(50, 80, 68, 45, 2))],
  w: [
    join(
      line(28, 45, 40, 80, 2),
      line(40, 80, 50, 52, 2),
      line(50, 52, 60, 80, 2),
      line(60, 80, 72, 45, 2),
    ),
  ],
  x: [line(34, 45, 66, 80, 3), line(66, 45, 34, 80, 3)],
  y: [line(32, 45, 50, 80, 2), line(68, 45, 42, 98, 4)],
  z: [join(line(34, 45, 66, 45, 2), line(66, 45, 34, 80, 2), line(34, 80, 66, 80, 2))],
};

// ─── Digits (y 10..80) ──────────────────────────────────────────────────────

const DIGITS: Record<string, CharStrokes> = {
  "0": [arc(50, 45, 20, 34, -90, -450, 12)],
  "1": [join(line(36, 28, 52, 11, 2), line(52, 11, 52, 80, 4))],
  "2": [
    [
      [33, 24],
      [38, 14],
      [50, 11],
      [62, 14],
      [67, 24],
      [64, 35],
      [53, 48],
      [41, 60],
      [34, 70],
      [33, 80],
      [50, 80],
      [68, 80],
    ],
  ],
  "3": [
    [
      [34, 20],
      [41, 12],
      [53, 11],
      [63, 15],
      [66, 25],
      [62, 35],
      [52, 41],
      [49, 42],
      [52, 43],
      [63, 49],
      [67, 60],
      [63, 72],
      [52, 79],
      [40, 79],
      [32, 71],
    ],
  ],
  "4": [join(line(56, 12, 32, 52, 3), line(32, 52, 70, 52, 2)), line(58, 24, 58, 80, 3)],
  "5": [
    [
      [38, 12],
      [37, 27],
      [36, 40],
      [46, 37],
      [57, 38],
      [65, 46],
      [67, 58],
      [63, 70],
      [52, 78],
      [40, 78],
      [32, 70],
    ],
    line(38, 12, 66, 12, 2),
  ],
  "6": [
    [
      [63, 13],
      [52, 11],
      [43, 16],
      [36, 27],
      [32, 42],
      [31, 56],
      [35, 69],
      [44, 78],
      [55, 79],
      [64, 73],
      [67, 62],
      [63, 52],
      [54, 46],
      [44, 47],
      [36, 54],
      [32, 62],
    ],
  ],
  "7": [join(line(32, 12, 68, 12, 2), line(68, 12, 42, 80, 3)), line(38, 48, 62, 48, 2)],
  "8": [
    [
      [63, 20],
      [54, 12],
      [43, 12],
      [35, 19],
      [35, 29],
      [42, 38],
      [54, 44],
      [63, 51],
      [66, 62],
      [62, 73],
      [51, 79],
      [40, 76],
      [34, 67],
      [35, 57],
      [43, 48],
      [55, 41],
      [62, 33],
      [63, 24],
      [57, 15],
    ],
  ],
  "9": [arc(53, 32, 16, 20, -60, -420, 10), line(69, 30, 62, 80, 3)],
};

// ─── German umlauts + ß ─────────────────────────────────────────────────────

const GERMAN: Record<string, CharStrokes> = {
  Ä: withUmlautDots(CAPITALS.A, 2),
  Ö: withUmlautDots(CAPITALS.O, 2),
  Ü: withUmlautDots(CAPITALS.U, 2),
  ä: withUmlautDots(LOWERCASE.a, 33),
  ö: withUmlautDots(LOWERCASE.o, 33),
  ü: withUmlautDots(LOWERCASE.u, 33),
  ß: [
    [
      [33, 80],
      [33, 45],
      [33, 22],
      [37, 13],
      [46, 10],
      [55, 12],
      [60, 19],
      [59, 28],
      [53, 34],
      [60, 39],
      [66, 48],
      [67, 60],
      [62, 72],
      [53, 79],
      [44, 79],
    ],
  ],
};

const ALL: Record<string, CharStrokes> = { ...CAPITALS, ...LOWERCASE, ...DIGITS, ...GERMAN };

/** Every character this dataset covers, as one string. */
export const SUPPORTED_TRACING_CHARS = Object.keys(ALL).join("");

/** Ordered strokes (median point lists) for a character, or null if uncovered. */
export function getCharStrokes(char: string): CharStrokes | null {
  return ALL[char] ?? null;
}

/** Usage contract fed to the generation agent alongside the data. */
export const CHAR_STROKES_GUIDE = `
## Character stroke paths (German school print convention)
Coordinate box: 100x100 per character, y grows DOWNWARD. Reference lines:
cap/ascender top y=10, x-height top y=45, baseline y=80, descender bottom y=98
(umlaut dots sit above the cap line). Scale uniformly into your glyph area.
Each character = ordered strokes; each stroke = an ordered point list (its median /
centerline) in CORRECT pedagogical stroke order and direction — the first point is
where the pen starts.
How to use in a tracing game:
- Guide: show the faded character (real font text) behind; overlay the CURRENT stroke's
  median with a start dot and direction arrow; optionally animate the median as a demo.
- Validate per stroke, in order: sample the child's drawn stroke; it should start near
  the median's start, stay inside a generous corridor around the median (tolerance
  ~15-20 units for young children), and progress monotonically along it (direction!).
  Advance to the next stroke only after the current one is accepted.
- Only characters missing from this data may fall back to raster-coverage validation
  (offscreen fillText + getImageData) — never invent stroke geometry yourself.
`.trim();
