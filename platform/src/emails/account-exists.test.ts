import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { AccountExistsEmail } from "./account-exists";
import { accountExistsCopy, authCodeCopy } from "./strings";

async function renderEmail(appUrl: string, locale: "en" | "de"): Promise<string> {
  return render(createElement(AccountExistsEmail, { appUrl, locale }));
}

describe("AccountExistsEmail", () => {
  it("links to sign-in and to the password reset on the web app", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    expect(html).toContain('href="https://app.dodi.app/login"');
    expect(html).toContain('href="https://app.dodi.app/reset-password"');
    expect(html).toContain(accountExistsCopy("en").signInButton);
  });

  it("trims a trailing slash from the app url", async () => {
    const html = await renderEmail("https://app.dodi.app/", "en");
    expect(html).toContain("https://app.dodi.app/login");
    expect(html).not.toContain("dodi.app//");
  });

  it("carries no code and uses the auth footer (the sender may have no session)", async () => {
    const html = await renderEmail("https://app.dodi.app", "en");
    expect(html).not.toMatch(/>\s*\d{6}\s*</);
    expect(html).toContain("this address was used to sign in or register at dodi");
    expect(html).not.toContain("Manage notifications");
    expect(authCodeCopy("en").footerReason).toContain("sign in or register");
  });

  it("localizes copy to the parent's language", async () => {
    const html = await renderEmail("https://app.dodi.app", "de");
    expect(html).toContain(accountExistsCopy("de").heading);
    expect(html).toContain(accountExistsCopy("de").signInButton);
    expect(html).toContain(accountExistsCopy("de").resetLink);
  });

  it("follows the copy rules: lowercase brand, no em dashes", () => {
    for (const locale of ["en", "de"] as const) {
      const text = Object.values(accountExistsCopy(locale)).join(" ");
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/Dodi/);
    }
  });
});
