import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { FriendApprovalEmail } from "./friend-approval";
import { friendApprovalCopy } from "./strings";

async function renderEmail(appUrl: string, locale: "en" | "de"): Promise<string> {
  return render(createElement(FriendApprovalEmail, { appUrl, locale }));
}

describe("FriendApprovalEmail", () => {
  it("renders a CTA that deep-links into the parent dashboard", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    expect(html).toContain("https://app.dodi.app/parent/dashboard");
    expect(html).toContain(friendApprovalCopy("en").button);
  });

  it("trims a trailing slash from the app url", async () => {
    const html = await renderEmail("https://app.dodi.app/", "en");
    expect(html).toContain("https://app.dodi.app/parent/dashboard");
    expect(html).not.toContain("dodi.app//parent");
  });

  it("shows the logo image in the header (no text wordmark, no wave emoji)", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    expect(html).toContain('src="https://app.dodi.app/dodi-logo.png"');
    expect(html).toContain('alt="dodi"');
    expect(html).not.toContain("👋");
  });

  it("localizes copy to the parent's language", async () => {
    const html = await renderEmail("https://app.dodi.app", "de");
    expect(html).toContain(friendApprovalCopy("de").heading);
    expect(html).toContain(friendApprovalCopy("de").button);
  });

  it("stays privacy-preserving — carries the no-names note and links to settings", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    // Apostrophes get HTML-entity-escaped, so match an apostrophe-free fragment.
    expect(html).toContain("Due to our end-to-end encryption");
    expect(html).toContain(
      "https://app.dodi.app/parent/settings/notifications",
    );
  });
});
