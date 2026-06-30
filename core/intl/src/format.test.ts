import { describe, expect, it } from "vitest";

import {
  dateFieldMask,
  dateFieldPlaceholder,
  formatDate,
  formatDateField,
  formatDateOnly,
  formatDateTime,
  formatElapsed,
  formatTime,
  parseDateField,
} from "./format";
import type { DateFormatPref } from "./prefs";

// ICU inserts a narrow no-break space (U+202F) / no-break space (U+00A0) before
// AM/PM in newer Node; normalize them to a regular space for stable assertions.
const norm = (s: string | null): string | null =>
  s == null ? null : s.replace(/[  ]/g, " ");

const instant = "2026-06-24T14:30:00Z";
const pref = (p: Partial<DateFormatPref>): DateFormatPref => ({
  timeZone: "UTC",
  dateStyle: "numeric",
  timeStyle: "24h",
  ...p,
});

describe("formatDateTime", () => {
  it("DE numeric default → 24.06.2026, 14:30 (24h)", () => {
    expect(norm(formatDateTime(instant, { locale: "de", pref: pref({}) }))).toBe(
      "24.06.2026, 14:30",
    );
  });

  it("EN numeric default → 06/24/2026, 02:30 PM (12h)", () => {
    expect(
      norm(formatDateTime(instant, { locale: "en", pref: pref({ timeStyle: "12h" }) })),
    ).toBe("06/24/2026, 02:30 PM");
  });

  it("honors the timezone — same instant differs by zone", () => {
    expect(
      norm(formatDateTime(instant, { locale: "en", pref: pref({ timeZone: "Europe/Berlin" }) })),
    ).toBe("06/24/2026, 16:30");
    expect(
      norm(formatDateTime(instant, { locale: "en", pref: pref({ timeZone: "America/New_York" }) })),
    ).toBe("06/24/2026, 10:30");
  });

  it("omits time when timeStyle is none", () => {
    expect(
      norm(formatDateTime(instant, { locale: "de", pref: pref({ timeStyle: "none" }) })),
    ).toBe("24.06.2026");
  });

  it("returns empty string for invalid/empty input", () => {
    expect(formatDateTime("", { locale: "en", pref: pref({}) })).toBe("");
    expect(formatDateTime(null, { locale: "en", pref: pref({}) })).toBe("");
  });
});

describe("formatDate (long form)", () => {
  it("EN long → June 24, 2026", () => {
    expect(norm(formatDate(instant, { locale: "en", pref: pref({ dateStyle: "long" }) }))).toBe(
      "June 24, 2026",
    );
  });

  it("DE long → 24. Juni 2026", () => {
    expect(norm(formatDate(instant, { locale: "de", pref: pref({ dateStyle: "long" }) }))).toBe(
      "24. Juni 2026",
    );
  });
});

describe("explicit date patterns (language-independent)", () => {
  // Same output regardless of locale — order/separator are fixed.
  it.each(["en", "de"])("dmy_slash → 24/06/2026 (%s)", (locale) => {
    expect(formatDate(instant, { locale, pref: pref({ dateStyle: "dmy_slash" }) })).toBe(
      "24/06/2026",
    );
  });

  it("mdy_slash → 06/24/2026", () => {
    expect(formatDate(instant, { locale: "de", pref: pref({ dateStyle: "mdy_slash" }) })).toBe(
      "06/24/2026",
    );
  });

  it("dmy_dot → 24.06.2026", () => {
    expect(formatDate(instant, { locale: "en", pref: pref({ dateStyle: "dmy_dot" }) })).toBe(
      "24.06.2026",
    );
  });

  it("ymd_dash → 2026-06-24", () => {
    expect(formatDate(instant, { locale: "en", pref: pref({ dateStyle: "ymd_dash" }) })).toBe(
      "2026-06-24",
    );
  });

  it("appends time, locale-joined", () => {
    expect(
      norm(formatDateTime(instant, { locale: "de", pref: pref({ dateStyle: "dmy_dot" }) })),
    ).toBe("24.06.2026, 14:30");
    expect(
      norm(
        formatDateTime(instant, {
          locale: "en",
          pref: pref({ dateStyle: "dmy_slash", timeStyle: "12h" }),
        }),
      ),
    ).toBe("24/06/2026, 02:30 PM");
  });

  it("the assembled date still respects the timezone (crossing midnight)", () => {
    const nearMidnight = "2026-06-24T02:30:00Z";
    // Berlin (UTC+2) → still the 24th; New York (UTC-4) → rolls back to the 23rd.
    expect(
      formatDate(nearMidnight, { locale: "en", pref: pref({ dateStyle: "dmy_dot", timeZone: "Europe/Berlin" }) }),
    ).toBe("24.06.2026");
    expect(
      formatDate(nearMidnight, { locale: "en", pref: pref({ dateStyle: "dmy_dot", timeZone: "America/New_York" }) }),
    ).toBe("23.06.2026");
  });

  it("works for date-only (birthdate), no day shift", () => {
    expect(formatDateOnly("2018-06-24", { locale: "en", dateStyle: "ymd_dash" })).toBe(
      "2018-06-24",
    );
    expect(formatDateOnly("2018-06-24", { locale: "de", dateStyle: "dmy_dot" })).toBe(
      "24.06.2018",
    );
  });
});

describe("formatTime", () => {
  it("24h vs 12h", () => {
    expect(norm(formatTime(instant, { locale: "en", pref: pref({ timeStyle: "24h" }) }))).toBe(
      "14:30",
    );
    expect(norm(formatTime(instant, { locale: "en", pref: pref({ timeStyle: "12h" }) }))).toBe(
      "02:30 PM",
    );
  });
});

describe("formatDateOnly (birthdate-safe)", () => {
  it("never shifts the calendar day (UTC-pinned)", () => {
    expect(norm(formatDateOnly("2018-06-24", { locale: "en", dateStyle: "long" }))).toBe(
      "June 24, 2018",
    );
    expect(formatDateOnly("2018-06-24", { locale: "en", dateStyle: "numeric" })).toBe(
      "06/24/2018",
    );
    expect(norm(formatDateOnly("2018-06-24", { locale: "de", dateStyle: "long" }))).toBe(
      "24. Juni 2018",
    );
  });

  it("reads the date portion of an ISO timestamp", () => {
    expect(formatDateOnly("2018-06-24T23:00:00.000Z", { locale: "en", dateStyle: "numeric" })).toBe(
      "06/24/2018",
    );
  });

  it("returns null for empty/invalid", () => {
    expect(formatDateOnly(null, { locale: "en", dateStyle: "long" })).toBeNull();
    expect(formatDateOnly("", { locale: "en", dateStyle: "long" })).toBeNull();
    expect(formatDateOnly("not-a-date", { locale: "en", dateStyle: "long" })).toBeNull();
  });
});

describe("dateFieldMask + placeholder (typeable input order)", () => {
  it("derives the locale order for numeric/long", () => {
    expect(dateFieldMask("de", "numeric")).toEqual({
      order: ["day", "month", "year"],
      separator: ".",
    });
    expect(dateFieldMask("en", "numeric")).toEqual({
      order: ["month", "day", "year"],
      separator: "/",
    });
    // long isn't typeable → falls back to the locale's numeric order.
    expect(dateFieldMask("de", "long")).toEqual({
      order: ["day", "month", "year"],
      separator: ".",
    });
  });

  it("uses the fixed order for explicit styles, regardless of locale", () => {
    expect(dateFieldMask("en", "dmy_dot")).toEqual({
      order: ["day", "month", "year"],
      separator: ".",
    });
    expect(dateFieldMask("de", "ymd_dash")).toEqual({
      order: ["year", "month", "day"],
      separator: "-",
    });
  });

  it("renders a human-readable placeholder", () => {
    expect(dateFieldPlaceholder(dateFieldMask("de", "numeric"))).toBe("DD.MM.YYYY");
    expect(dateFieldPlaceholder(dateFieldMask("en", "numeric"))).toBe("MM/DD/YYYY");
    expect(dateFieldPlaceholder(dateFieldMask("en", "ymd_dash"))).toBe("YYYY-MM-DD");
  });
});

describe("formatDateField / parseDateField (round-trip)", () => {
  it("formats canonical ISO into the masked order", () => {
    expect(formatDateField("2018-06-24", dateFieldMask("de", "numeric"))).toBe("24.06.2018");
    expect(formatDateField("2018-06-24", dateFieldMask("en", "numeric"))).toBe("06/24/2018");
    expect(formatDateField("2018-06-24", dateFieldMask("en", "ymd_dash"))).toBe("2018-06-24");
    expect(formatDateField("", dateFieldMask("en", "numeric"))).toBe("");
    expect(formatDateField(null, dateFieldMask("en", "numeric"))).toBe("");
  });

  it("parses typed input back to canonical ISO using the field order", () => {
    expect(parseDateField("24.06.2018", dateFieldMask("de", "numeric"))).toBe("2018-06-24");
    expect(parseDateField("06/24/2018", dateFieldMask("en", "numeric"))).toBe("2018-06-24");
    expect(parseDateField("2018-06-24", dateFieldMask("en", "ymd_dash"))).toBe("2018-06-24");
  });

  it("is separator-agnostic and zero-pads", () => {
    expect(parseDateField("3/7/2018", dateFieldMask("en", "numeric"))).toBe("2018-03-07");
    expect(parseDateField("7.3.2018", dateFieldMask("de", "numeric"))).toBe("2018-03-07");
  });

  it("rejects incomplete, out-of-range, and non-calendar dates", () => {
    const de = dateFieldMask("de", "numeric");
    expect(parseDateField("24.06", de)).toBeNull(); // only two groups
    expect(parseDateField("24.06.18", de)).toBeNull(); // 2-digit year
    expect(parseDateField("32.06.2018", de)).toBeNull(); // no day 32
    expect(parseDateField("31.02.2018", de)).toBeNull(); // Feb 31 overflow
    expect(parseDateField("", de)).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("under a minute", () => {
    expect(formatElapsed("2026-06-24T14:00:00Z", "2026-06-24T14:00:45Z")).toBe("45s");
  });
  it("minutes and seconds", () => {
    expect(formatElapsed("2026-06-24T14:00:00Z", "2026-06-24T14:03:12Z")).toBe("3m 12s");
  });
});
