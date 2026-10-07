import { afterEach, describe, expect, it, vi } from "vitest";

import {
  imageMimeType,
  nearestVeniceAspectRatio,
  VeniceImageProvider,
  veniceDimensions,
} from "./venice";

function mockFetchOnce(
  response: unknown,
  { ok = true, status = 200, headers = {} }: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      headers: new Headers(headers),
      json: async () => response,
      text: async () => JSON.stringify(response),
    }),
  );
}

function lastBody(): Record<string, unknown> {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  return JSON.parse(fetchMock.mock.calls[0][1].body) as Record<string, unknown>;
}

describe("imageMimeType", () => {
  it("labels the payload by its magic bytes, not the requested format", () => {
    expect(imageMimeType("iVBORw0KGgoAAAA")).toBe("image/png");
    expect(imageMimeType("/9j/4QNoRXhpZgAA")).toBe("image/jpeg");
    expect(imageMimeType("UklGRiQAAABXRUJQ")).toBe("image/webp");
  });
});

describe("VeniceImageProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts to /image/generate with safe mode on and returns a PNG data URL", async () => {
    mockFetchOnce({ images: ["iVBORw0KGgoQUJD"] });
    const provider = new VeniceImageProvider("secret-key", "grok-imagine-image");
    const { dataUrl } = await provider.generateImage("draw an owl");

    expect(dataUrl).toBe("data:image/png;base64,iVBORw0KGgoQUJD");
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.venice.ai/api/v1/image/generate");
    expect(init.headers.Authorization).toBe("Bearer secret-key");
    expect(lastBody()).toMatchObject({
      model: "grok-imagine-image",
      prompt: "draw an owl",
      safe_mode: true,
      hide_watermark: true,
      format: "png",
      resolution: "1K",
    });
  });

  it("snaps 4:5 to the nearest Grok Imagine ratio (3:4)", async () => {
    mockFetchOnce({ images: ["QUJD"] });
    await new VeniceImageProvider("k", "grok-imagine-image").generateImage("owl", {
      aspectRatio: "4:5",
    });
    expect(lastBody().aspect_ratio).toBe("3:4");
  });

  it("sends width/height for models without aspect-ratio support", async () => {
    mockFetchOnce({ images: ["QUJD"] });
    await new VeniceImageProvider("k", "z-image-turbo").generateImage("owl", { aspectRatio: "4:5" });
    const body = lastBody();
    expect(body).not.toHaveProperty("aspect_ratio");
    expect(body).toMatchObject({ width: 816, height: 1024 });
  });

  it("rejects a blurred or policy-flagged image", async () => {
    mockFetchOnce({ images: ["QUJD"] }, { headers: { "x-venice-is-blurred": "true" } });
    await expect(
      new VeniceImageProvider("k", "grok-imagine-image").generateImage("owl"),
    ).rejects.toThrow(/unsuitable/);
  });

  it("throws with the HTTP status on a failed request and on empty data", async () => {
    mockFetchOnce({ error: "bad key" }, { ok: false, status: 401 });
    await expect(
      new VeniceImageProvider("k", "grok-imagine-image").generateImage("owl"),
    ).rejects.toThrow(/401/);
    mockFetchOnce({ images: [] });
    await expect(
      new VeniceImageProvider("k", "grok-imagine-image").generateImage("owl"),
    ).rejects.toThrow(/no image data/i);
  });
});

describe("Venice image shape helpers", () => {
  it("defaults to the first supported ratio without a hint", () => {
    expect(nearestVeniceAspectRatio(undefined, ["1:1", "16:9"])).toBe("1:1");
  });

  it("keeps the long edge at 1024 and snaps to multiples of 8", () => {
    expect(veniceDimensions("16:9")).toEqual({ width: 1024, height: 576 });
    expect(veniceDimensions(undefined)).toEqual({ width: 1024, height: 1024 });
  });
});
