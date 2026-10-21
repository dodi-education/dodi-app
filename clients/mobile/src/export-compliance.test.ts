import { describe, expect, it } from "vitest";

import config from "../app.config";

// App Store processing drops a build (ITMS-90592, no email until hours later,
// and the build never shows in TestFlight) whose Info.plist sets
// ITSAppUsesNonExemptEncryption = YES without the ITSEncryptionExportComplianceCode
// App Store Connect issues once encryption documentation is approved.
describe("iOS export compliance", () => {
  it("never claims non-exempt encryption without App Store Connect's compliance code", () => {
    const ios = config.ios ?? {};
    const claimsNonExempt =
      ios.config?.usesNonExemptEncryption === true || ios.infoPlist?.ITSAppUsesNonExemptEncryption === true;
    const hasComplianceCode = typeof ios.infoPlist?.ITSEncryptionExportComplianceCode === "string";
    expect(claimsNonExempt && !hasComplianceCode).toBe(false);
  });
});
