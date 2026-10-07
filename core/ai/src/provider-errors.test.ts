import { describe, expect, it } from "vitest";

import { isProviderAuthError, isProviderBalanceError } from "./provider-errors";

describe("isProviderAuthError", () => {
  it("recognizes SDK errors by status and fetch errors by message", () => {
    expect(isProviderAuthError(Object.assign(new Error("Unauthorized"), { status: 401 }))).toBe(true);
    expect(isProviderAuthError(new Error("Venice image generation failed (401): bad key"))).toBe(true);
  });

  it("ignores other failures", () => {
    expect(isProviderAuthError(Object.assign(new Error("Payment required"), { status: 402 }))).toBe(false);
    expect(isProviderAuthError(new Error("generated 4010 tokens"))).toBe(false);
    expect(isProviderAuthError("401")).toBe(false);
    expect(isProviderAuthError(null)).toBe(false);
  });
});

describe("isProviderBalanceError", () => {
  it("recognizes a 402 by status or message, nothing else", () => {
    expect(
      isProviderBalanceError(Object.assign(new Error("Insufficient balance"), { status: 402 })),
    ).toBe(true);
    expect(isProviderBalanceError(new Error('402 "Insufficient USD or Diem balance"'))).toBe(true);
    expect(isProviderBalanceError(Object.assign(new Error("Unauthorized"), { status: 401 }))).toBe(false);
  });
});
