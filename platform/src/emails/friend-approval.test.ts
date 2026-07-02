import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { FriendApprovalEmail } from "./friend-approval";
import { friendApprovalCopy } from "./strings";

async function renderEmail(appUrl: string, locale: "en" | "de"): Promise<string> {
  return render(createElement(FriendApprovalEmail, { appUrl, locale }));
}

describe("FriendApprovalEmail", () => {
  it("renders a CTA that deep-links to the parent Kids page (where approvals live)", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    expect(html).toContain("https://app.dodi.app/parent/kids");
    expect(html).toContain(friendApprovalCopy("en").button);
  });

  it("trims a trailing slash from the app url", async () => {
    const html = await renderEmail("https://app.dodi.app/", "en");
    expect(html).toContain("https://app.dodi.app/parent/kids");
    expect(html).not.toContain("dodi.app//parent");
  });

  it("shows the logo from the platform origin (no text wordmark, no wave emoji)", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    // Logo is platform-hosted (api.dodi.app), independent of the web app origin.
    expect(html).toContain('src="https://api.dodi.app/dodi-logo.png"');
    expect(html).toContain('alt="dodi"');
    expect(html).not.toContain("👋");
  });

  it("references no off-domain resources (no external font/@import)", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    expect(html).not.toContain("googleapis");
    expect(html).not.toContain("@import");
  });

  it("honors EMAIL_ASSET_BASE_URL for the logo host", async () => {
    process.env.EMAIL_ASSET_BASE_URL = "https://cdn.example.com";
    try {
      const html = await renderEmail("https://app.dodi.app", "en");
      expect(html).toContain('src="https://cdn.example.com/dodi-logo.png"');
    } finally {
      delete process.env.EMAIL_ASSET_BASE_URL;
    }
  });

  it("localizes copy to the parent's language", async () => {
    const html = await renderEmail("https://app.dodi.app", "de");
    expect(html).toContain(friendApprovalCopy("de").heading);
    expect(html).toContain(friendApprovalCopy("de").button);
  });

  it("stays privacy-preserving — carries the no-names note and links to settings", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    // Apostrophes get HTML-entity-escaped, so match an apostrophe-free fragment
    // of the privacy note (kept short so copy tweaks don't break the test).
    expect(html).toContain("end-to-end encryption");
    expect(html).toContain(
      "https://app.dodi.app/parent/settings/notifications",
    );
  });
});
