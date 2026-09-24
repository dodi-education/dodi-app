import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ serviceDb: {} }));
vi.mock("@/services/discover", () => ({
  getPublishedGamePreviewImage: vi.fn(),
}));

import { getPublishedGamePreviewImage } from "@/services/discover";

import { GET } from "./route";

const ID = "0d15c0de-0000-4000-8000-000000000001";
// 1×1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function get(id: string): Promise<Response> {
  return GET(
    new Request(`https://platform.dodi.app/api/public/games/${id}/preview-image`),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.mocked(getPublishedGamePreviewImage).mockReset();
});

describe("GET /api/public/games/[id]/preview-image", () => {
  it("serves a LIVE game's data-URL preview as image bytes", async () => {
    vi.mocked(getPublishedGamePreviewImage).mockResolvedValue(
      `data:image/png;base64,${PNG_BASE64}`,
    );
    const res = await get(ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toContain("public");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes).toString("base64")).toBe(PNG_BASE64);
    expect(getPublishedGamePreviewImage).toHaveBeenCalledWith({}, ID);
  });

  it("404s a malformed id without touching the database", async () => {
    const res = await get("not-a-uuid");
    expect(res.status).toBe(404);
    expect(getPublishedGamePreviewImage).not.toHaveBeenCalled();
  });

  it("404s a game that is not live or has no preview", async () => {
    vi.mocked(getPublishedGamePreviewImage).mockResolvedValue(null);
    expect((await get(ID)).status).toBe(404);
  });

  it("404s a path preview (system games serve those from the web app)", async () => {
    vi.mocked(getPublishedGamePreviewImage).mockResolvedValue("/games/drawing.png");
    expect((await get(ID)).status).toBe(404);
  });

  it("refuses to serve an SVG data URL", async () => {
    vi.mocked(getPublishedGamePreviewImage).mockResolvedValue(
      `data:image/svg+xml;base64,${btoa("<svg onload=alert(1)/>")}`,
    );
    expect((await get(ID)).status).toBe(404);
  });
});
