import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatElapsed,
  formatTime,
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

describe("formatElapsed", () => {
  it("under a minute", () => {
    expect(formatElapsed("2026-06-24T14:00:00Z", "2026-06-24T14:00:45Z")).toBe("45s");
  });
  it("minutes and seconds", () => {
    expect(formatElapsed("2026-06-24T14:00:00Z", "2026-06-24T14:03:12Z")).toBe("3m 12s");
  });
});
