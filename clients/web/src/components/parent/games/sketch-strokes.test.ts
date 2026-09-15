import { describe, expect, it } from "vitest";

import {
  appendPoint,
  renderStrokes,
  SKETCH_SIZE,
  type SketchStroke,
  type StrokeCanvas,
  undoStroke,
} from "./sketch-strokes";

const pen = (points: SketchStroke["points"], overrides: Partial<SketchStroke> = {}): SketchStroke => ({
  color: "#000000",
  width: 3,
  isEraser: false,
  points,
  ...overrides,
});

/** Records every drawing op in order, so tests can assert the exact path. */
function fakeCanvas() {
  const ops: string[] = [];
  const ctx: StrokeCanvas = {
    lineCap: "butt",
    lineJoin: "miter",
    lineWidth: 0,
    strokeStyle: "",
    globalCompositeOperation: "source-over",
    beginPath: () => ops.push("begin"),
    moveTo: (x, y) => ops.push(`move ${x},${y}`),
    lineTo: (x, y) => ops.push(`line ${x},${y}`),
    stroke: () => ops.push(`stroke ${ctx.strokeStyle} w${ctx.lineWidth} ${ctx.globalCompositeOperation}`),
  };
  return { ctx, ops };
}

describe("appendPoint", () => {
  it("adds a point that moved far enough", () => {
    const stroke = appendPoint(pen([{ x: 0, y: 0 }]), { x: 10, y: 0 });
    expect(stroke.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("drops a point that barely moved, returning the same stroke", () => {
    const original = pen([{ x: 0, y: 0 }]);
    const stroke = appendPoint(original, { x: 0.5, y: 0.5 });
    expect(stroke).toBe(original);
  });

  it("always takes the first point of a stroke", () => {
    expect(appendPoint(pen([]), { x: 3, y: 4 }).points).toEqual([{ x: 3, y: 4 }]);
  });

  it("honours a custom minimum distance", () => {
    const original = pen([{ x: 0, y: 0 }]);
    expect(appendPoint(original, { x: 5, y: 0 }, 10)).toBe(original);
  });
});

describe("undoStroke", () => {
  it("removes the last stroke", () => {
    const strokes = [pen([{ x: 0, y: 0 }]), pen([{ x: 1, y: 1 }])];
    expect(undoStroke(strokes)).toEqual([strokes[0]]);
  });

  it("is a no-op on an empty sketch", () => {
    expect(undoStroke([])).toEqual([]);
  });
});

describe("renderStrokes", () => {
  it("draws a line through every point, scaled", () => {
    const { ctx, ops } = fakeCanvas();
    renderStrokes(ctx, [pen([{ x: 1, y: 2 }, { x: 3, y: 4 }])], 2);
    expect(ops).toEqual(["begin", "move 2,4", "line 6,8", "stroke #000000 w6 source-over"]);
  });

  it("renders a tap as a dot rather than nothing", () => {
    const { ctx, ops } = fakeCanvas();
    renderStrokes(ctx, [pen([{ x: 5, y: 5 }])]);
    expect(ops).toEqual(["begin", "move 5,5", "line 5,5", "stroke #000000 w3 source-over"]);
  });

  it("cuts eraser strokes out instead of painting over them", () => {
    const { ctx, ops } = fakeCanvas();
    renderStrokes(ctx, [pen([{ x: 0, y: 0 }, { x: 1, y: 1 }], { isEraser: true, width: 9 })]);
    expect(ops[3]).toContain("destination-out");
    // The mode must be restored so later drawing on the same context is normal.
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("skips empty strokes and sets round joins", () => {
    const { ctx, ops } = fakeCanvas();
    renderStrokes(ctx, [pen([])]);
    expect(ops).toEqual([]);
    expect(ctx.lineCap).toBe("round");
    expect(ctx.lineJoin).toBe("round");
  });
});

describe("SKETCH_SIZE", () => {
  it("matches the game canvas's portrait shape", () => {
    // A sketch is a layout hint for the built game, so it must share its frame.
    expect(SKETCH_SIZE.width / SKETCH_SIZE.height).toBeCloseTo(4 / 5);
  });
});
