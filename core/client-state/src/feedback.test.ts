import { describe, expect, it, vi } from "vitest";

import { createFeedbackDraft, feedbackDraftError, submitFeedback, type FeedbackDraft } from "./feedback";

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
};

describe("createFeedbackDraft", () => {
  it("starts empty from the sidebar", () => {
    expect(createFeedbackDraft()).toEqual({ senderName: "", category: "", message: "", gameId: null });
  });

  it("presets the category and attaches the game from a Discover report", () => {
    expect(createFeedbackDraft({ category: "inappropriate_content", gameId: GAME })).toEqual({
      senderName: "",
      category: "inappropriate_content",
      message: "",
      gameId: GAME,
    });
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
        clientPlatform: "web",
      }),
    });
  });

  it("leaves out a missing game and folds a pasted line break in the name", async () => {
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
      submitFeedback({ api: api(new Response("{}", { status: 500 })) }, FILLED, "web"),
    ).resolves.toEqual({ kind: "error", key: "failed" });
    await expect(submitFeedback({ api: api(new Error("offline")) }, FILLED, "web")).resolves.toEqual({
      kind: "error",
      key: "failed",
    });
  });
});
