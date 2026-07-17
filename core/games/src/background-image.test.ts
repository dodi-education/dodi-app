import { describe, expect, it } from "vitest";

import {
  BACKGROUND_IMAGE_PLACEHOLDER,
  BACKGROUND_STYLE_BLOCK,
  extractBackgroundImage,
  hasBackgroundPlaceholder,
  injectBackgroundImage,
} from "./background-image";

const DATA_URL = "data:image/jpeg;base64,QUJDREVGR0g=";

const codeWith = (block: string): string =>
  `<!doctype html><html><head>${block}</head><body><div style="background:var(--background-image) center/cover"></div><script>x=1</script></body></html>`;

describe("hasBackgroundPlaceholder", () => {
  it("detects the placeholder", () => {
    expect(hasBackgroundPlaceholder(codeWith(BACKGROUND_STYLE_BLOCK))).toBe(true);
    expect(hasBackgroundPlaceholder(codeWith("<style>body{}</style>"))).toBe(false);
  });
});

describe("inject → extract round-trip", () => {
  it("injects the data URL and extracts it back to placeholder form", () => {
    const placeholderCode = codeWith(BACKGROUND_STYLE_BLOCK);
    const injected = injectBackgroundImage(placeholderCode, DATA_URL);
    expect(injected).toContain(DATA_URL);
    expect(injected).not.toContain(BACKGROUND_IMAGE_PLACEHOLDER);

    const extracted = extractBackgroundImage(injected);
    expect(extracted.dataUrl).toBe(DATA_URL);
    expect(extracted.code).toBe(placeholderCode);
  });
});

describe("extractBackgroundImage", () => {
  it.each([
    ['double quotes', `<style id="background-image">:root{--background-image:url("${DATA_URL}")}</style>`],
    ["single quotes", `<style id='background-image'>:root{--background-image:url('${DATA_URL}')}</style>`],
    ["no quotes", `<style id="background-image">:root{--background-image:url(${DATA_URL})}</style>`],
  ])("handles %s around the url", (_label, block) => {
    const { code, dataUrl } = extractBackgroundImage(codeWith(block));
    expect(dataUrl).toBe(DATA_URL);
    expect(code).toContain(BACKGROUND_IMAGE_PLACEHOLDER);
    expect(code).not.toContain(DATA_URL);
  });

  it("passes through code without a background-image block", () => {
    const code = codeWith("<style>body{background:#fff}</style>");
    expect(extractBackgroundImage(code)).toEqual({ code, dataUrl: null });
  });

  it("passes through a background-image block without an inline image", () => {
    const code = codeWith(BACKGROUND_STYLE_BLOCK);
    expect(extractBackgroundImage(code)).toEqual({ code, dataUrl: null });
  });

  it("only touches the data URL inside the background-image block", () => {
    const other = "data:image/png;base64,T1RIRVI=";
    const code =
      codeWith(`<style id="background-image">:root{--background-image:url("${DATA_URL}")}</style>`) +
      `<img src="${other}">`;
    const extracted = extractBackgroundImage(code);
    expect(extracted.dataUrl).toBe(DATA_URL);
    expect(extracted.code).toContain(other);
  });
});

describe("injectBackgroundImage", () => {
  it("is a no-op without the placeholder", () => {
    const code = codeWith("<style>body{}</style>");
    expect(injectBackgroundImage(code, DATA_URL)).toBe(code);
  });

  it("replaces every occurrence literally", () => {
    const code = `${BACKGROUND_IMAGE_PLACEHOLDER} and ${BACKGROUND_IMAGE_PLACEHOLDER}`;
    expect(injectBackgroundImage(code, "$&x")).toBe("$&x and $&x");
  });
});
