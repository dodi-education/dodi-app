/** The slice of a keyboard event the studio composer decides on. */
export interface ComposerKeyEvent {
  key: string;
  shiftKey: boolean;
  /** True while an IME is composing (Enter confirms a candidate, not a send). */
  isComposing?: boolean;
}

/** How the composer is being used. */
export interface ComposerKeyOptions {
  /** Coarse pointer (phone/tablet): the on-screen return key types a newline. */
  isTouch: boolean;
}

/**
 * Whether a keydown in the studio composer should send the draft to the agent.
 * Desktop: Enter sends, Shift+Enter newlines. Touch: never; send via the button.
 */
export function isComposerSendKey(
  event: ComposerKeyEvent,
  { isTouch }: ComposerKeyOptions,
): boolean {
  if (isTouch || event.isComposing) return false;
  return event.key === "Enter" && !event.shiftKey;
}
