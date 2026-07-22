import { describe, expect, it } from "vitest";

import {
  HARD_REJECTION_CODES,
  REJECTION_CODES,
  REJECTION_CODE_CRITERIA,
  SOFT_REJECTION_CODES,
  isRejectionCode,
  parseRejectionReasons,
  rejectionKindOf,
  worstRejectionKind,
} from "./publication-review";

describe("rejection code registry", () => {
  it("every code carries its kind as prefix", () => {
    for (const code of HARD_REJECTION_CODES) {
      expect(code.startsWith("hard_")).toBe(true);
      expect(rejectionKindOf(code)).toBe("hard");
    }
    for (const code of SOFT_REJECTION_CODES) {
      expect(code.startsWith("soft_")).toBe(true);
      expect(rejectionKindOf(code)).toBe("soft");
    }
  });

  it("has criteria text for every code (prompt renders from this)", () => {
    for (const code of REJECTION_CODES) {
      expect(REJECTION_CODE_CRITERIA[code].length).toBeGreaterThan(20);
    }
  });

  it("isRejectionCode accepts registry codes and rejects everything else", () => {
    expect(isRejectionCode("hard_security_violation")).toBe(true);
    expect(isRejectionCode("soft_quality_below_bar")).toBe(true);
    expect(isRejectionCode("hard_totally_made_up")).toBe(false);
    expect(isRejectionCode(42)).toBe(false);
    expect(isRejectionCode(null)).toBe(false);
  });
});

describe("worstRejectionKind", () => {
  it("any hard reason makes the rejection hard", () => {
    expect(
      worstRejectionKind([
        { code: "soft_quality_below_bar", note: "" },
        { code: "hard_forbidden_content", note: "" },
      ]),
    ).toBe("hard");
  });

  it("all-soft reasons stay soft", () => {
    expect(
      worstRejectionKind([
        { code: "soft_quality_below_bar", note: "" },
        { code: "soft_misleading_metadata", note: "" },
      ]),
    ).toBe("soft");
  });
});

describe("parseRejectionReasons", () => {
  it("reads a well-formed jsonb array", () => {
    expect(
      parseRejectionReasons([
        { code: "soft_contains_personal_information", note: "Kid name on line 3" },
      ]),
    ).toEqual([
      { code: "soft_contains_personal_information", note: "Kid name on line 3" },
    ]);
  });

  it("drops unknown codes and malformed entries instead of throwing", () => {
    expect(
      parseRejectionReasons([
        { code: "soft_future_code", note: "from a newer taxonomy" },
        "not an object",
        null,
        { note: "missing code" },
        { code: "hard_child_safety", note: 7 },
        { code: "hard_child_safety", note: "asks for a phone number" },
      ]),
    ).toEqual([
      { code: "hard_child_safety", note: "" },
      { code: "hard_child_safety", note: "asks for a phone number" },
    ]);
  });

  it("returns [] for non-array input (null column, wrong shape)", () => {
    expect(parseRejectionReasons(null)).toEqual([]);
    expect(parseRejectionReasons({ code: "hard_child_safety" })).toEqual([]);
    expect(parseRejectionReasons("[]")).toEqual([]);
  });
});
