import { describe, expect, it, vi } from "vitest";

import {
  createFeedbackDraft,
  FEEDBACK_IMAGE_BOUNDS,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_SOURCE_MAX_BYTES,
  feedbackDraftError,
  feedbackImageSourceError,
  prepareFeedbackImage,
  submitFeedback,
  type FeedbackDraft,
} from "./feedback";

function api(response: Response | Error) {
  return {
    request: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  };
}

const GAME = "5b6f0a53-7f0a-4b53-9a53-000000000002";

const FILLED: FeedbackDraft = {
  senderName: "Sam",
  category: "bug_report",
  message: "The game froze.",
  gameId: null,
  image: null,
};

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

/** A JPEG data URL of `bytes` decoded bytes. */
function jpegOf(bytes: number): string {
  return `data:image/jpeg;base64,${"A".repeat(Math.ceil(bytes / 3) * 4)}`;
}

describe("createFeedbackDraft", () => {
  it("starts empty from the sidebar", () => {
    expect(createFeedbackDraft()).toEqual({
      senderName: "",
      category: "",
      message: "",
      gameId: null,
      image: null,
    });
  });

  it("presets the category and attaches the game from a Discover report", () => {
    expect(createFeedbackDraft({ category: "inappropriate_content", gameId: GAME })).toEqual({
      senderName: "",
      category: "inappropriate_content",
      message: "",
      gameId: GAME,
      image: null,
    });
  });
});

describe("feedbackImageSourceError", () => {
  it("refuses only a file over the pick limit", () => {
    expect(feedbackImageSourceError(FEEDBACK_IMAGE_SOURCE_MAX_BYTES)).toBeNull();
    expect(feedbackImageSourceError(FEEDBACK_IMAGE_SOURCE_MAX_BYTES + 1)).toBe("imageTooLarge");
    expect(feedbackImageSourceError(undefined)).toBeNull();
  });
});

describe("prepareFeedbackImage", () => {
  it("re-encodes the image into the first bound", async () => {
    const scaler = { downscale: vi.fn(async () => IMAGE) };

    await expect(prepareFeedbackImage(scaler, "data:image/png;base64,iVBORw0KGgo=")).resolves.toEqual({
      kind: "ready",
      image: IMAGE,
    });
    expect(scaler.downscale).toHaveBeenCalledTimes(1);
    expect(scaler.downscale).toHaveBeenCalledWith("data:image/png;base64,iVBORw0KGgo=", FEEDBACK_IMAGE_BOUNDS[0]);
  });

  it("steps down until the image fits the upload limit", async () => {
    const scaler = {
      downscale: vi
        .fn()
        .mockResolvedValueOnce(jpegOf(FEEDBACK_IMAGE_MAX_BYTES + 3))
        .mockResolvedValueOnce(jpegOf(FEEDBACK_IMAGE_MAX_BYTES - 3)),
    };

    const outcome = await prepareFeedbackImage(scaler, IMAGE);

    expect(outcome).toEqual({ kind: "ready", image: jpegOf(FEEDBACK_IMAGE_MAX_BYTES - 3) });
    expect(scaler.downscale.mock.calls.map((call) => call[1])).toEqual(FEEDBACK_IMAGE_BOUNDS.slice(0, 2));
  });

  it("gives up when even the smallest bound is too large", async () => {
    const scaler = { downscale: vi.fn(async () => jpegOf(FEEDBACK_IMAGE_MAX_BYTES + 3)) };

    await expect(prepareFeedbackImage(scaler, IMAGE)).resolves.toEqual({ kind: "error", key: "imageTooLarge" });
    expect(scaler.downscale).toHaveBeenCalledTimes(FEEDBACK_IMAGE_BOUNDS.length);
  });

  it("reports an image the device cannot read", async () => {
    await expect(prepareFeedbackImage({ downscale: async () => null }, IMAGE)).resolves.toEqual({
      kind: "error",
      key: "imageUnreadable",
    });
    await expect(
      prepareFeedbackImage({ downscale: async () => Promise.reject(new Error("decode")) }, IMAGE),
    ).resolves.toEqual({ kind: "error", key: "imageUnreadable" });
  });
});

describe("feedbackDraftError", () => {
  it("asks for the name, then the category, then the message", () => {
    expect(feedbackDraftError(createFeedbackDraft())).toBe("nameRequired");
    expect(feedbackDraftError({ ...FILLED, senderName: "   " })).toBe("nameRequired");
    expect(feedbackDraftError({ ...FILLED, category: "" })).toBe("categoryRequired");
    expect(feedbackDraftError({ ...FILLED, message: " \n " })).toBe("messageRequired");
    expect(feedbackDraftError(FILLED)).toBeNull();
  });
});

describe("submitFeedback", () => {
  it("posts the trimmed message with the attached game", async () => {
    const platform = api(new Response("{}", { status: 201 }));

    await expect(
      submitFeedback(
        { api: platform },
        {
          senderName: "  Sam  ",
          category: "inappropriate_content",
          message: "  too scary  ",
          gameId: GAME,
          image: IMAGE,
        },
        "web",
      ),
    ).resolves.toEqual({ kind: "sent" });
    expect(platform.request).toHaveBeenCalledWith("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderName: "Sam",
        category: "inappropriate_content",
        message: "too scary",
        gameId: GAME,
        image: IMAGE,
        clientPlatform: "web",
      }),
    });
  });

  it("leaves out a missing game and image and folds a pasted line break in the name", async () => {
    const platform = api(new Response("{}", { status: 201 }));

    await submitFeedback({ api: platform }, { ...FILLED, senderName: "Sam\nRiver" }, "mobile");

    const body = JSON.parse((platform.request.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toEqual({
      senderName: "Sam River",
      category: "bug_report",
      message: "The game froze.",
      clientPlatform: "mobile",
    });
  });

  it("does not send an incomplete draft", async () => {
    const platform = api(new Response());
    await expect(submitFeedback({ api: platform }, { ...FILLED, category: "" }, "web")).resolves.toEqual({
      kind: "error",
      key: "categoryRequired",
    });
    expect(platform.request).not.toHaveBeenCalled();
  });

  it("maps failures", async () => {
    await expect(
      submitFeedback({ api: api(new Response("{}", { status: 429 })) }, FILLED, "web"),
    ).resolves.toEqual({ kind: "error", key: "rateLimited" });
    await expect(
      submitFeedback({ api: api(new Response("{}", { status: 413 })) }, FILLED, "web"),
    ).resolves.toEqual({ kind: "error", key: "imageTooLarge" });
    await expect(
      submitFeedback({ api: api(new Response("{}", { status: 500 })) }, FILLED, "web"),
    ).resolves.toEqual({ kind: "error", key: "failed" });
    await expect(submitFeedback({ api: api(new Error("offline")) }, FILLED, "web")).resolves.toEqual({
      kind: "error",
      key: "failed",
    });
  });
});
