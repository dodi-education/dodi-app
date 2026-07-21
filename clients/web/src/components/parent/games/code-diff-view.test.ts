import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CodeDiffView } from "./code-diff-view";

const PREVIOUS = ["<html>", "<body>", "old line", "</body>", "</html>"].join("\n");
const CURRENT = ["<html>", "<body>", "new line", "</body>", "</html>"].join("\n");

describe("CodeDiffView probe", () => {
  it("renders removed and added rows with both line-number gutters", () => {
    const html = renderToStaticMarkup(
      createElement(CodeDiffView, {
        previousCode: PREVIOUS,
        code: CURRENT,
        unchangedLabel: (count: number) => `${count} unchanged`,
      }),
    );
    expect(html).toContain("old line");
    expect(html).toContain("new line");
    expect(html).toContain("bg-danger-soft");
    expect(html).toContain("bg-success-soft");
  });

  it("collapses long unchanged runs behind an expand button", () => {
    const middle = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n");
    const html = renderToStaticMarkup(
      createElement(CodeDiffView, {
        previousCode: `start\n${middle}\nold end`,
        code: `start\n${middle}\nnew end`,
        unchangedLabel: (count: number) => `${count} unchanged`,
      }),
    );
    // Leading run: "start" + lines 1..37 collapse (no change above to keep
    // context for); lines 38..40 stay visible as context before the change.
    expect(html).toContain("38 unchanged");
    expect(html).not.toContain("line 20"); // hidden inside the collapsed run
  });
});
