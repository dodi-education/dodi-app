import { render } from "@react-email/components";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { ContentReportEmail, type ContentReportEmailProps } from "./content-report";

const BASE: ContentReportEmailProps = {
  appUrl: "https://app.dodi.app",
  reportId: "report-1",
  contentKind: "discover_game",
  reason: "inappropriate",
  details: "The quiz asks about horror movies.",
  gameId: "game-1",
  gameTitle: "Space Quiz",
  clientPlatform: "web",
};

async function text(props: ContentReportEmailProps): Promise<string> {
  return render(createElement(ContentReportEmail, props), { plainText: true });
}

describe("ContentReportEmail", () => {
  it("shows the kind, reason, game and the parent's description", async () => {
    const body = await text(BASE);
    expect(body).toContain("A game on Discover: Inappropriate for kids.");
    expect(body).toContain("“Space Quiz” (game-1)");
    expect(body).toContain("The quiz asks about horror movies.");
    expect(body).toContain("report-1");
  });

  it("names a private game by id only", async () => {
    const body = await text({ ...BASE, contentKind: "game", gameTitle: null });
    expect(body).toContain("Game: (game-1)");
  });
});
