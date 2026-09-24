import { afterEach, describe, expect, it, vi } from "vitest";

import { publicGamePreviewImageUrl } from "./public-game-urls";

const ID = "0d15c0de-0000-4000-8000-000000000001";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicGamePreviewImageUrl", () => {
  it("points a data-URL preview at the platform's public preview endpoint", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://platform.dodi.app/");
    expect(
      publicGamePreviewImageUrl({
        id: ID,
        preview_image: "data:image/jpeg;base64,/9j/AA==",
      }),
    ).toBe(`https://platform.dodi.app/api/public/games/${ID}/preview-image`);
  });

  it("keeps a system game's path preview on the app origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.dodi.app");
    expect(
      publicGamePreviewImageUrl({ id: ID, preview_image: "/games/drawing.png" }),
    ).toBe("https://app.dodi.app/games/drawing.png");
  });

  it("returns undefined without a preview or a public API origin", () => {
    expect(publicGamePreviewImageUrl({ id: ID, preview_image: null })).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(
      publicGamePreviewImageUrl({ id: ID, preview_image: "data:image/png;base64,AA==" }),
    ).toBeUndefined();
  });
});
