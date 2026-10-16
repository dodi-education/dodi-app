import { describe, expect, it } from "vitest";

import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SENDER_NAME_MAX_LENGTH,
  SendFeedbackRequestSchema,
} from "./feedback";

const VALID = {
  senderName: "Alex",
  category: "bug_report",
  message: "The game froze after level two.",
  clientPlatform: "web",
} as const;

describe("SendFeedbackRequestSchema", () => {
  it("accepts a filled form and trims the text", () => {
    const parsed = SendFeedbackRequestSchema.parse({
      ...VALID,
      senderName: "  Alex  ",
      message: "\n The game froze. \n",
    });
    expect(parsed.senderName).toBe("Alex");
    expect(parsed.message).toBe("The game froze.");
  });

  it("accepts an attached game id", () => {
    const gameId = "7f1c2f1e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
    expect(SendFeedbackRequestSchema.parse({ ...VALID, gameId }).gameId).toBe(gameId);
  });

  it("refuses a missing or blank name and message", () => {
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, senderName: "   " }).success).toBe(false);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, message: " \n " }).success).toBe(false);
    const { senderName: _, ...noName } = VALID;
    expect(SendFeedbackRequestSchema.safeParse(noName).success).toBe(false);
  });

  it("refuses a name with a line break or another control character", () => {
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, senderName: "Al\nex" }).success).toBe(false);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, senderName: "Al\u0007ex" }).success).toBe(false);
  });

  it("keeps line breaks inside the message", () => {
    expect(SendFeedbackRequestSchema.parse({ ...VALID, message: "one\ntwo" }).message).toBe("one\ntwo");
  });

  it("caps the name and message lengths", () => {
    const name = "a".repeat(FEEDBACK_SENDER_NAME_MAX_LENGTH);
    const message = "m".repeat(FEEDBACK_MESSAGE_MAX_LENGTH);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, senderName: name, message }).success).toBe(true);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, senderName: `${name}a` }).success).toBe(false);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, message: `${message}m` }).success).toBe(false);
  });

  it("refuses an unknown category, platform or game id", () => {
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, category: "praise" }).success).toBe(false);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, clientPlatform: "tv" }).success).toBe(false);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, gameId: "not-a-uuid" }).success).toBe(false);
  });
});
