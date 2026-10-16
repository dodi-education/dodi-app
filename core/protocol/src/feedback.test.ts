import { describe, expect, it } from "vitest";

import {
  dataUrlByteLength,
  FEEDBACK_IMAGE_MAX_BYTES,
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

  it("accepts an attached JPEG, PNG or WebP data URL", () => {
    for (const type of ["jpeg", "png", "webp"]) {
      const image = `data:image/${type};base64,/9j/4AAQ`;
      expect(SendFeedbackRequestSchema.parse({ ...VALID, image }).image).toBe(image);
    }
  });

  it("refuses an SVG, a plain URL or broken base64 as the image", () => {
    for (const image of [
      "data:image/svg+xml;base64,PHN2Zz4=",
      "https://example.com/a.png",
      "data:image/png;base64,not base64!",
      "data:image/png,rawbytes",
    ]) {
      expect(SendFeedbackRequestSchema.safeParse({ ...VALID, image }).success).toBe(false);
    }
  });

  it("caps the image at the byte limit", () => {
    // 2 MiB = 699050 full base64 groups plus one group holding two bytes.
    const groups = Math.floor(FEEDBACK_IMAGE_MAX_BYTES / 3);
    const fits = `data:image/jpeg;base64,${"A".repeat(groups * 4)}AAA=`;
    expect(dataUrlByteLength(fits)).toBe(FEEDBACK_IMAGE_MAX_BYTES);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, image: fits }).success).toBe(true);
    const over = `data:image/jpeg;base64,${"A".repeat((groups + 1) * 4)}`;
    expect(dataUrlByteLength(over)).toBe(FEEDBACK_IMAGE_MAX_BYTES + 1);
    expect(SendFeedbackRequestSchema.safeParse({ ...VALID, image: over }).success).toBe(false);
  });
});

describe("dataUrlByteLength", () => {
  it("counts the decoded bytes, padding included", () => {
    expect(dataUrlByteLength("data:image/png;base64,AAAA")).toBe(3);
    expect(dataUrlByteLength("data:image/png;base64,AAA=")).toBe(2);
    expect(dataUrlByteLength("data:image/png;base64,AA==")).toBe(1);
  });
});
