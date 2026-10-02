/**
 * The kid view's voice-session exits (web: the kid layout and switcher call
 * the session store's endSession() at these points).
 */
import { companionSession } from "@/lib/companion-session";

/**
 * End the active kid's voice session: on a kid switch (fires the outgoing
 * kid's memory update), when leaving the kid view, and when it unmounts.
 */
export function endVoiceSession(): void {
  companionSession.store.getState().endSession();
}
