import { describe, expect, it } from "vitest";

import { classifyClose } from "@dodi/ai/voice/voice-client";

import { companionErrorKind } from "./companion-error";

/**
 * The kid screens pick their text from the error's kind, never print the raw
 * message (regression: "No API key configured for xai" showed under a German
 * "let's try again", next to a retry button that could not help).
 */
describe("companionErrorKind", () => {
  it("passes the microphone codes through", () => {
    expect(companionErrorKind("micPermissionNeeded")).toBe("micPermissionNeeded");
    expect(companionErrorKind("secureContextRequired")).toBe("secureContextRequired");
  });

  it("asks for a grown-up when the account has no voice provider or key", () => {
    expect(companionErrorKind("No API key configured for xai")).toBe("needsSetup");
    expect(companionErrorKind("No AI provider configured")).toBe("needsSetup");
    expect(companionErrorKind("Vault is locked")).toBe("needsSetup");
  });

  it("asks for a grown-up when the provider rejects the key or the quota is used up", () => {
    expect(companionErrorKind(classifyClose(1008, "").message)).toBe("needsSetup");
    expect(companionErrorKind(classifyClose(1011, "RESOURCE_EXHAUSTED").message)).toBe("needsSetup");
    expect(
      companionErrorKind(
        "dodi couldn't authenticate with xAI. Please check the API key in parent settings, then reconnect.",
      ),
    ).toBe("needsSetup");
  });

  it("treats everything else as a connection problem worth a retry", () => {
    expect(companionErrorKind(classifyClose(1006, "").message)).toBe("connection");
    expect(companionErrorKind("Failed to connect")).toBe("connection");
    expect(
      companionErrorKind("dodi couldn't start the xAI voice session. Please try again in a moment."),
    ).toBe("connection");
  });
});
