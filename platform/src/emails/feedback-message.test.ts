import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { FeedbackMessageEmail, type FeedbackMessageEmailProps } from "./feedback-message";

const BASE: FeedbackMessageEmailProps = {
  appUrl: "https://app.dodi.app",
  feedbackId: "feedback-1",
  accountId: "account-1",
  accountEmail: "parent@example.com",
  senderName: "Sam",
  category: "inappropriate_content",
  message: "The quiz asks about horror movies.\nPlease check it.",
  gameId: "game-1",
  gameTitle: "Space Quiz",
  clientPlatform: "web",
  image: null,
};

async function text(props: FeedbackMessageEmailProps): Promise<string> {
  return render(createElement(FeedbackMessageEmail, props), { plainText: true });
}

describe("FeedbackMessageEmail", () => {
  it("shows the category, sender, account, game and the message", async () => {
    const body = await text(BASE);
    expect(body).toContain("NEW FEEDBACK: INAPPROPRIATE CONTENT");
    expect(body).toContain("From Sam (parent@example.com)");
    expect(body).toContain("Account: account-1");
    expect(body).toContain("“Space Quiz” (game-1)");
    expect(body).toContain("The quiz asks about horror movies.");
    expect(body).toContain("Reply to this email to answer Sam directly.");
    expect(body).toContain("feedback-1");
  });

  it("names an attached image", async () => {
    const body = await text({ ...BASE, image: { filename: "feedback-1a2b3c4d.jpg", byteSize: 421_888 } });
    expect(body).toContain("Image attached: feedback-1a2b3c4d.jpg (412 KB)");
    expect(await text(BASE)).not.toContain("Image attached");
  });

  it("names a private game by id only", async () => {
    const body = await text({ ...BASE, gameTitle: null });
    expect(body).toContain("Game: (game-1)");
  });

  it("leaves out the game line and the reply hint when they do not apply", async () => {
    const body = await text({ ...BASE, category: "bug_report", gameId: null, accountEmail: null });
    expect(body).toContain("NEW FEEDBACK: BUG REPORT");
    expect(body).not.toContain("Game:");
    expect(body).not.toContain("Reply to this email");
  });
});
