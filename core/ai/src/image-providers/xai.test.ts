import { afterEach, describe, expect, it, vi } from "vitest";

import { XaiImageProvider } from "./xai";

function mockFetchOnce(response: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => response,
      text: async () => JSON.stringify(response),
    }),
  );
}

describe("XaiImageProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the b64_json image as a data URL", async () => {
    mockFetchOnce({ data: [{ b64_json: "QUJD" }] });

    const provider = new XaiImageProvider("key", "grok-imagine-image");
    const { dataUrl } = await provider.generateImage("draw an owl");
    expect(dataUrl).toBe("data:image/png;base64,QUJD");
  });

  it("posts to the xAI images endpoint with a bearer key and b64_json format", async () => {
    mockFetchOnce({ data: [{ b64_json: "QUJD" }] });

    const provider = new XaiImageProvider("secret-key", "grok-imagine-image");
    await provider.generateImage("owl");

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/images/generations");
    expect(init.headers.Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("grok-imagine-image");
    expect(body.response_format).toBe("b64_json");
  });

  it("snaps an unsupported aspect ratio (4:5) to the nearest allowed (3:4)", async () => {
    mockFetchOnce({ data: [{ b64_json: "QUJD" }] });

    const provider = new XaiImageProvider("key", "grok-imagine-image");
    await provider.generateImage("owl", { aspectRatio: "4:5" });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.aspect_ratio).toBe("3:4");
  });

  it("throws when the response contains no image data", async () => {
    mockFetchOnce({ data: [{}] });

    const provider = new XaiImageProvider("key", "grok-imagine-image");
    await expect(provider.generateImage("owl")).rejects.toThrow(/no image data/i);
  });

  it("throws with the HTTP status on a failed request", async () => {
    mockFetchOnce({ error: "bad key" }, false, 403);

    const provider = new XaiImageProvider("key", "grok-imagine-image");
    await expect(provider.generateImage("owl")).rejects.toThrow(/403/);
  });
});
