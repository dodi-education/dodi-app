import { describe, expect, it } from "vitest";

import { resolveStudioPanes, type StudioPanesInput } from "./studio-panes";

const wide = (over: Partial<StudioPanesInput> = {}): StudioPanesInput => ({
  vertical: false,
  locked: false,
  isPlanMode: false,
  mtab: "game",
  planSurface: "chat",
  ...over,
});

const vertical = (over: Partial<StudioPanesInput> = {}): StudioPanesInput =>
  wide({ vertical: true, ...over });

describe("resolveStudioPanes", () => {
  it("shows both panes side by side on a wide layout", () => {
    expect(resolveStudioPanes(wide())).toEqual({
      showTabBar: false,
      showMain: true,
      showChat: true,
    });
  });

  it("gates the sidebar away on a wide layout while the draft is locked", () => {
    expect(resolveStudioPanes(wide({ locked: true, mtab: "chat" }))).toEqual({
      showTabBar: false,
      showMain: true,
      showChat: false,
    });
  });

  it("gives the Plan step's chat the whole width until a surface opens", () => {
    expect(resolveStudioPanes(wide({ isPlanMode: true }))).toEqual({
      showTabBar: false,
      showMain: false,
      showChat: true,
    });
    for (const planSurface of ["sketch", "plan"] as const) {
      expect(resolveStudioPanes(wide({ isPlanMode: true, planSurface }))).toEqual({
        showTabBar: false,
        showMain: true,
        showChat: true,
      });
    }
  });

  it("keeps the main pane visible while locked, even if the chat tab was last picked", () => {
    // Regression: locked + mtab "chat" used to hide both panes.
    expect(resolveStudioPanes(vertical({ locked: true, mtab: "chat" }))).toEqual({
      showTabBar: false,
      showMain: true,
      showChat: false,
    });
  });

  it("makes the chat pane fullscreen on the Plan step, whatever the tab or surface", () => {
    for (const mtab of ["game", "chat"] as const) {
      for (const planSurface of ["chat", "sketch", "plan"] as const) {
        expect(
          resolveStudioPanes(vertical({ isPlanMode: true, mtab, planSurface })),
        ).toEqual({ showTabBar: false, showMain: false, showChat: true });
      }
    }
  });

  it("follows the tab switch on a vertical layout outside the Plan step", () => {
    expect(resolveStudioPanes(vertical({ mtab: "game" }))).toEqual({
      showTabBar: true,
      showMain: true,
      showChat: false,
    });
    expect(resolveStudioPanes(vertical({ mtab: "chat" }))).toEqual({
      showTabBar: true,
      showMain: false,
      showChat: true,
    });
  });
});
