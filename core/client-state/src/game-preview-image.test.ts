import { describe, expect, it } from "vitest";

import { previewImageSource } from "./game-preview-image";

const APP_ORIGIN = "https://app.dodi.app";

describe("previewImageSource", () => {
  // System games store their preview as a path on the web app
  // ("/images/game-previews/mandala.png"); the web resolves it against its own
  // origin, the app has none, so it showed the tag tile instead.
  it("resolves a system game's web-relative preview against the app origin", () => {
    expect(previewImageSource("/images/game-previews/mandala.png", APP_ORIGIN)).toBe(
      "https://app.dodi.app/images/game-previews/mandala.png",
    );
    expect(previewImageSource("/images/game-previews/drawing.png", `${APP_ORIGIN}/`)).toBe(
      "https://app.dodi.app/images/game-previews/drawing.png",
    );
  });

  it("passes decrypted data URLs and absolute https URLs through", () => {
    expect(previewImageSource("data:image/jpeg;base64,AAAA", APP_ORIGIN)).toBe("data:image/jpeg;base64,AAAA");
    expect(previewImageSource("https://cdn.example/p.png", APP_ORIGIN)).toBe("https://cdn.example/p.png");
  });

  it("refuses anything else", () => {
    expect(previewImageSource(null, APP_ORIGIN)).toBeNull();
    expect(previewImageSource("", APP_ORIGIN)).toBeNull();
    expect(previewImageSource("enc:v1:sealed", APP_ORIGIN)).toBeNull();
    expect(previewImageSource("//evil.example/x.png", APP_ORIGIN)).toBeNull();
    expect(previewImageSource("javascript:alert(1)", APP_ORIGIN)).toBeNull();
    expect(previewImageSource("http://insecure.example/x.png", APP_ORIGIN)).toBeNull();
  });
});
