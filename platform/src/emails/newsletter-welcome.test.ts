import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { NewsletterWelcomeEmail } from "./newsletter-welcome";
import { newsletterWelcomeCopy } from "./strings";

async function renderEmail(appUrl: string, locale: "en" | "de"): Promise<string> {
  return render(createElement(NewsletterWelcomeEmail, { appUrl, locale }));
}

describe("NewsletterWelcomeEmail", () => {
  it("renders the welcome copy and a CTA to the app", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    // Apostrophes are HTML-entity-escaped in the output, so match an
    // apostrophe-free fragment of the heading.
    expect(html).toContain("subscribed");
    expect(html).toContain(newsletterWelcomeCopy("en").button);
    expect(html).toContain("https://app.dodi.app");
  });

  it("trims a trailing slash from the app url", async () => {
    const html = await renderEmail("https://app.dodi.app/", "en");
    expect(html).not.toContain("dodi.app//");
  });

  it("overrides the footer — no account 'manage notifications' link", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    expect(html).toContain(
      "receiving this because you subscribed to the dodi newsletter.",
    );
    // Subscribers have no account, so the settings link must NOT appear.
    expect(html).not.toContain("/parent/settings/notifications");
  });

  it("localizes copy to German", async () => {
    const html = await renderEmail("https://app.dodi.app", "de");
    expect(html).toContain(newsletterWelcomeCopy("de").heading);
    expect(html).toContain(newsletterWelcomeCopy("de").button);
  });

  it("references no off-domain resources", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    expect(html).not.toContain("googleapis");
    expect(html).not.toContain("@import");
  });
});
