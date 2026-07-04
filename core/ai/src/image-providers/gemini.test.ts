import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiImageProvider } from "./gemini";

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

describe("GeminiImageProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the inline image as a data URL", async () => {
    mockFetchOnce({
      candidates: [
        {
          content: {
            parts: [
              { text: "here you go" },
              { inlineData: { mimeType: "image/png", data: "QUJD" } },
            ],
          },
        },
      ],
    });

    const provider = new GeminiImageProvider("key", "gemini-3.1-flash-image");
    const { dataUrl } = await provider.generateImage("draw an owl");
    expect(dataUrl).toBe("data:image/png;base64,QUJD");
  });

  it("forwards the requested aspect ratio to the model", async () => {
    mockFetchOnce({
      candidates: [
        { content: { parts: [{ inlineData: { data: "QUJD" } }] } },
      ],
    });

    const provider = new GeminiImageProvider("key", "gemini-3.1-flash-image");
    await provider.generateImage("owl", { aspectRatio: "4:5" });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: "4:5" });
  });

  it("throws when the response contains no image part", async () => {
    mockFetchOnce({
      candidates: [{ content: { parts: [{ text: "no image" }] } }],
    });

    const provider = new GeminiImageProvider("key", "gemini-3.1-flash-image");
    await expect(provider.generateImage("owl")).rejects.toThrow(/no image data/i);
  });

  it("throws with the HTTP status on a failed request", async () => {
    mockFetchOnce({ error: "bad key" }, false, 403);

    const provider = new GeminiImageProvider("key", "gemini-3.1-flash-image");
    await expect(provider.generateImage("owl")).rejects.toThrow(/403/);
  });
});
