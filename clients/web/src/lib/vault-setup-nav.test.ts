import { describe, expect, it } from "vitest";

import { vaultSetupGuardTarget } from "./vault-setup-nav";

describe("vaultSetupGuardTarget", () => {
  it("stays put while the account key is on screen", () => {
    expect(
      vaultSetupGuardTarget({ hasPendingKey: true, hasContinued: false }),
    ).toBeNull();
  });

  it("leaves for the dashboard on a stray visit with no key to show", () => {
    expect(
      vaultSetupGuardTarget({ hasPendingKey: false, hasContinued: false }),
    ).toBe("/parent/dashboard");
  });

  // Regression: pressing Continue clears the pending key, which used to look
  // exactly like a stray visit — the guard then raced the step's own
  // navigation and dropped new accounts on the dashboard, skipping onboarding.
  it("stays out of the way once the step navigates on itself", () => {
    expect(
      vaultSetupGuardTarget({ hasPendingKey: false, hasContinued: true }),
    ).toBeNull();
  });
});
