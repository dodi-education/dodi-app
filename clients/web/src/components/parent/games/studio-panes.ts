/**
 * Which studio panes are on screen. Pure so the layout rules are testable:
 * the studio renders both panes always and only toggles their visibility.
 */

/** The Game/dodi switch of the vertical (portrait / narrow) layout. */
export type StudioTab = "game" | "chat";

/**
 * What the Plan step shows besides the conversation: nothing, the sketch pad,
 * or the plan on the table. On a phone the surface takes the thread's place
 * inside the chat pane; side by side it takes the stage, next to the chat.
 */
export type PlanSurface = "chat" | "sketch" | "plan";

export interface StudioPanesInput {
  /** Portrait phone or upright tablet: panes stack and only one is shown. */
  vertical: boolean;
  /** A draft past the Plan step and before its first save: chat is gated away. */
  locked: boolean;
  /** A draft on the Plan step: the conversation leads, the stage only assists. */
  isPlanMode: boolean;
  mtab: StudioTab;
  planSurface: PlanSurface;
}

export interface StudioPanes {
  showTabBar: boolean;
  showMain: boolean;
  showChat: boolean;
}

export function resolveStudioPanes(input: StudioPanesInput): StudioPanes {
  const { vertical, locked, isPlanMode, mtab, planSurface } = input;
  if (!vertical) {
    // The Plan step is the chat, full width, until a surface asks for the
    // stage; then the chat returns to being the sidebar next to it.
    if (isPlanMode) {
      const surfaceOpen = planSurface !== "chat";
      return { showTabBar: false, showMain: surfaceOpen, showChat: true };
    }
    // Side by side: the main stage is always there, the sidebar unless gated.
    return { showTabBar: false, showMain: true, showChat: !locked };
  }
  // The settings form fills the screen on its own, whatever tab was last picked.
  if (locked) return { showTabBar: false, showMain: true, showChat: false };
  // The Plan step lives entirely in the chat pane: no switch, no stage.
  if (isPlanMode) return { showTabBar: false, showMain: false, showChat: true };
  return { showTabBar: true, showMain: mtab === "game", showChat: mtab === "chat" };
}
