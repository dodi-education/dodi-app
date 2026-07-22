import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import type { PublicationRejectionReason } from "@dodi/protocol";

import {
  type PublicationOutcome,
  PublicationOutcomeEmail,
} from "./publication-outcome";
import { publicationOutcomeCopy } from "./strings";

function renderEmail(
  outcome: PublicationOutcome,
  opts: {
    locale?: "en" | "de";
    reasons?: PublicationRejectionReason[];
    sourceGameId?: string | null;
  } = {},
): Promise<string> {
  return render(
    createElement(PublicationOutcomeEmail, {
      appUrl: "https://app.dodi.app",
      locale: opts.locale ?? "en",
      title: "Counting Comets",
      outcome,
      sourceGameId: opts.sourceGameId ?? "game-1",
      reasons: opts.reasons ?? [],
    }),
  );
}

describe("PublicationOutcomeEmail", () => {
  it("names the game and, when approved, links into Discover", async () => {
    const html = await renderEmail("approved");
    const c = publicationOutcomeCopy("en");
    expect(html).toContain("Counting Comets");
    expect(html).toContain(c.approvedHeading);
    expect(html).toContain(c.approvedButton);
    expect(html).toContain("https://app.dodi.app/parent/games");
  });

  it("lists the reasons and the resubmit hint on a soft rejection", async () => {
    const html = await renderEmail("soft", {
      reasons: [{ code: "soft_quality_below_bar", note: "the start button is dead" }],
    });
    const c = publicationOutcomeCopy("en");
    // Localized label + the agent's specific note both appear.
    expect(html).toContain(c.reasonLabels.soft_quality_below_bar);
    expect(html).toContain("the start button is dead");
    // The "you can submit again" reassurance (apostrophe-free fragment).
    expect(html).toContain("submit your game for review again");
    // CTA deep-links to the parent's own editable game, not the public copy.
    expect(html).toContain("https://app.dodi.app/parent/games/game-1");
  });

  it("shares NO specifics on a hard rejection — even if reasons are passed", async () => {
    // The component must ignore reasons for a hard verdict (defense in depth,
    // on top of the notifier dropping them): a hard rejection reveals nothing.
    const html = await renderEmail("hard", {
      reasons: [
        { code: "hard_child_safety", note: "asked the child for a phone number" },
      ],
    });
    const c = publicationOutcomeCopy("en");
    // Apostrophes are HTML-entity-escaped, so match an apostrophe-free fragment
    // of the hard body to confirm the detail-free copy rendered.
    expect(html).toContain("After review, this game");
    // Neither the specific note nor any reason label leaks.
    expect(html).not.toContain("asked the child for a phone number");
    expect(html).not.toContain(c.reasonLabels.hard_child_safety);
    // No "fix it and resubmit" affordance — the rejection is permanent.
    expect(html).not.toContain("/parent/games/game-1");
  });

  it("localizes copy to the publisher's language", async () => {
    const html = await renderEmail("approved", { locale: "de" });
    expect(html).toContain(publicationOutcomeCopy("de").approvedHeading);
    expect(html).toContain(publicationOutcomeCopy("de").approvedButton);
  });

  it("links to settings and references no off-domain resources", async () => {
    const html = await renderEmail("approved");
    expect(html).toContain(
      "https://app.dodi.app/parent/settings/notifications",
    );
    expect(html).not.toContain("googleapis");
    expect(html).not.toContain("@import");
  });
});
