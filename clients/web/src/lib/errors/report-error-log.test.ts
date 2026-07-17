import { describe, expect, it, vi } from "vitest";

// The reporter module pulls in the dodi API client, whose module scope builds
// a Supabase browser client (needs env) — stub it, the pure fns don't use it.
vi.mock("@/lib/api", () => ({ dodi: { request: vi.fn() } }));

import { describeError, redactSecrets } from "./report-error-log";

describe("redactSecrets", () => {
  it("scrubs explicit secrets before pattern redaction", () => {
    const key = "short-key-1";
    expect(redactSecrets(`auth failed for ${key}`, [key])).toBe(
      "auth failed for [REDACTED]",
    );
  });

  it("redacts provider-key shapes and bearers", () => {
    const text =
      "401 invalid x-api-key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA " +
      "header Bearer abc.def.ghi tail";
    const out = redactSecrets(text);
    expect(out).not.toContain("sk-ant-");
    expect(out).not.toContain("abc.def.ghi");
    expect(out).toContain("401 invalid x-api-key");
  });

  it("redacts any 32+ char token-shaped run (over-redaction is fine)", () => {
    const out = redactSecrets(`request id ${"a1B2".repeat(10)} failed`);
    expect(out).toBe("request id [REDACTED] failed");
  });
});

describe("describeError", () => {
  it("extracts name/message/status from provider SDK-style errors", () => {
    const err = Object.assign(new Error("529 overloaded_error"), { status: 529 });
    err.name = "APIError";
    expect(describeError(err)).toEqual({
      errorName: "APIError",
      errorMessage: "529 overloaded_error",
      httpStatus: 529,
    });
  });

  it("handles non-Error throws and truncates long messages", () => {
    const described = describeError("boom ".repeat(200));
    expect(described.errorName).toBe("string");
    expect(described.errorMessage.length).toBe(501); // 500 + ellipsis
    expect(described.errorMessage.endsWith("…")).toBe(true);
    expect(described.httpStatus).toBeNull();
  });
});
