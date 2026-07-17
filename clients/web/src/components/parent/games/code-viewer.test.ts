import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeViewer } from "./code-viewer";

const SAMPLE = `<html><head><style>body{color:red}</style></head><body><script>const x = 1;</script></body></html>`;

describe("CodeViewer probe", () => {
  it("renders Prism token spans", () => {
    const html = renderToStaticMarkup(
      createElement(CodeViewer, { code: SAMPLE, copyLabel: "Copy", copiedLabel: "Copied" }),
    );
    expect(html).toContain("dodi-code");
    expect(html).toContain("token tag");
    expect(html).toContain("token keyword");
    expect(html).toContain("token property");
  });
});
