import { describe, expect, it } from "vitest";

import {
  CHAR_STROKE_COORDS,
  getCharStrokes,
  SUPPORTED_TRACING_CHARS,
} from "./char-strokes";

const CAPS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const GERMAN = "ÄÖÜäöüß";

describe("coverage", () => {
  it("covers A-Z, a-z, 0-9 and German umlauts + ß", () => {
    for (const ch of CAPS + LOWER + DIGITS + GERMAN) {
      expect(getCharStrokes(ch), `missing '${ch}'`).not.toBeNull();
    }
    expect(SUPPORTED_TRACING_CHARS).toHaveLength(69);
  });

  it("returns null for uncovered characters", () => {
    for (const ch of ["?", "€", "@", "漢", " "]) {
      expect(getCharStrokes(ch)).toBeNull();
    }
  });
});

describe("geometry invariants", () => {
  it("every stroke has >= 2 points, all inside the box", () => {
    for (const ch of SUPPORTED_TRACING_CHARS) {
      for (const stroke of getCharStrokes(ch)!) {
        expect(stroke.length, `'${ch}' stroke too short`).toBeGreaterThanOrEqual(2);
        for (const [x, y] of stroke) {
          expect(x, `'${ch}' x out of box`).toBeGreaterThanOrEqual(0);
          expect(x, `'${ch}' x out of box`).toBeLessThanOrEqual(100);
          expect(y, `'${ch}' y out of box`).toBeGreaterThanOrEqual(0);
          expect(y, `'${ch}' y out of box`).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  const bounds = (ch: string): { minY: number; maxY: number } => {
    const ys = getCharStrokes(ch)!.flat().map((p) => p[1]);
    return { minY: Math.min(...ys), maxY: Math.max(...ys) };
  };

  it("capitals and digits span cap height to baseline", () => {
    for (const ch of CAPS + DIGITS) {
      const { minY, maxY } = bounds(ch);
      expect(minY, `'${ch}' should reach the cap line`).toBeLessThanOrEqual(13);
      expect(maxY, `'${ch}' should reach the baseline`).toBeGreaterThanOrEqual(78);
      // Q's tail may poke slightly below, nothing else leaves the line area.
      expect(maxY, `'${ch}' too deep`).toBeLessThanOrEqual(ch === "Q" ? 86 : 82);
    }
  });

  it("plain x-height letters stay between x-height and baseline", () => {
    for (const ch of "acemnorsuvwxz") {
      const { minY, maxY } = bounds(ch);
      expect(minY, `'${ch}' too tall`).toBeGreaterThanOrEqual(43);
      expect(maxY, `'${ch}' baseline`).toBeGreaterThanOrEqual(78);
      expect(maxY, `'${ch}' too deep`).toBeLessThanOrEqual(82);
    }
  });

  it("ascenders rise, descenders descend", () => {
    for (const ch of "bdfhkl") {
      expect(bounds(ch).minY, `'${ch}' ascender`).toBeLessThanOrEqual(12);
    }
    for (const ch of "gjpqy") {
      expect(bounds(ch).maxY, `'${ch}' descender`).toBeGreaterThanOrEqual(93);
    }
  });
});

describe("stroke order & direction (German school print)", () => {
  it("E = stem first (top→bottom), then bars top→bottom, each left→right", () => {
    const strokes = getCharStrokes("E")!;
    expect(strokes).toHaveLength(4);
    const [stem, top, mid, bottom] = strokes;
    expect(stem[0][1]).toBeLessThan(stem[stem.length - 1][1]); // downward
    expect(top[0][1]).toBeLessThan(mid[0][1]);
    expect(mid[0][1]).toBeLessThan(bottom[0][1]);
    for (const bar of [top, mid, bottom]) {
      expect(bar[0][0]).toBeLessThan(bar[bar.length - 1][0]); // left→right
    }
  });

  it("T = top bar left→right, then stem downward", () => {
    const [bar, stem] = getCharStrokes("T")!;
    expect(bar[0][0]).toBeLessThan(bar[bar.length - 1][0]);
    expect(stem[0][1]).toBeLessThan(stem[stem.length - 1][1]);
  });

  it("A = up-stroke from bottom-left to apex, down to bottom-right, then crossbar", () => {
    const [up, down, bar] = getCharStrokes("A")!;
    expect(up[0][1]).toBeGreaterThan(up[up.length - 1][1]); // rises to the apex
    expect(up[0][0]).toBeLessThan(up[up.length - 1][0]); // from the left
    expect(down[0][1]).toBeLessThan(down[down.length - 1][1]); // falls from the apex
    expect(bar[0][0]).toBeLessThan(bar[bar.length - 1][0]); // crossbar left→right
  });

  it("verticals are written downward", () => {
    for (const ch of ["I", "l", "L", "H"]) {
      const stroke = getCharStrokes(ch)![0];
      expect(stroke[0][1], `'${ch}'`).toBeLessThan(stroke[stroke.length - 1][1]);
    }
  });

  it("round letters start at their own top and close the loop", () => {
    for (const ch of ["O", "o", "0"]) {
      const [stroke] = getCharStrokes(ch)!;
      const [first, last] = [stroke[0], stroke[stroke.length - 1]];
      const glyphTop = Math.min(...stroke.map((p) => p[1]));
      expect(first[1], `'${ch}' starts at its top`).toBeLessThanOrEqual(glyphTop + 1);
      expect(Math.hypot(first[0] - last[0], first[1] - last[1]), `'${ch}' closes`).toBeLessThan(3);
    }
  });

  it("5 = down-stroke + belly first, then the top bar left→right", () => {
    const strokes = getCharStrokes("5")!;
    expect(strokes).toHaveLength(2);
    expect(strokes[0][0][1]).toBeLessThanOrEqual(13); // starts at the top of the stem
    const bar = strokes[1];
    expect(bar.every((p) => p[1] <= 13)).toBe(true); // bar sits on the cap line
    expect(bar[0][0]).toBeLessThan(bar[bar.length - 1][0]);
  });

  it("i and j draw the body first, the dot last", () => {
    for (const ch of ["i", "j"]) {
      const strokes = getCharStrokes(ch)!;
      expect(strokes).toHaveLength(2);
      const dotStroke = strokes[1];
      expect(dotStroke).toHaveLength(2);
      expect(dotStroke[0][1]).toBeLessThan(40); // above the x-height body
    }
  });

  it("umlauts = base glyph strokes, then two dots left→right", () => {
    const pairs: Array<[string, string]> = [
      ["Ä", "A"],
      ["Ö", "O"],
      ["Ü", "U"],
      ["ä", "a"],
      ["ö", "o"],
      ["ü", "u"],
    ];
    for (const [umlaut, base] of pairs) {
      const u = getCharStrokes(umlaut)!;
      const b = getCharStrokes(base)!;
      expect(u.length, umlaut).toBe(b.length + 2);
      expect(u.slice(0, b.length), umlaut).toEqual(b);
      const [leftDot, rightDot] = u.slice(-2);
      expect(leftDot[0][0]).toBeLessThan(rightDot[0][0]);
    }
  });

  it("coordinate reference lines are exported for consumers", () => {
    expect(CHAR_STROKE_COORDS).toMatchObject({
      box: 100,
      capTop: 10,
      xHeightTop: 45,
      baseline: 80,
      descender: 98,
    });
  });
});
