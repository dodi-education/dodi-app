// Shared logic: @dodi/client-state/companion-session. This module binds the
// app's session instance (lib/companion-session.ts) to React with the web's
// names (web: stores/dodi-session-store).
import { bindStore } from "@dodi/client-state/react";
import {
  selectCompanionActivityKind,
  selectCompanionThinking,
  type CompanionActivity,
  type CompanionContext,
  type CompanionDisplayMode,
  type CompanionSessionState,
  type CompanionStatus,
} from "@dodi/client-state/companion-session";

import { companionSession } from "@/lib/companion-session";

export type { CompanionMessage } from "@dodi/client-state/companion-session";

export type DodiDisplayMode = CompanionDisplayMode;
export type DodiContext = CompanionContext;
export type DodiState = CompanionStatus;
export type DodiActivity = CompanionActivity;
export type DodiSessionState = CompanionSessionState;

/** The voice companion session (connect, presence, tools, transcripts, memory). */
export const useDodiSessionStore = bindStore(companionSession.store);

// Is any in-game AI provider currently working? Drives the "thinking" avatar.
export const selectDodiThinking = selectCompanionThinking;

// Which activity's copy to show; image wins over writing over thinking.
export const selectDodiActivityKind = selectCompanionActivityKind;

/** Loudness of dodi's voice playing right now, 0..1; drives the 3D jaw. */
export function dodiOutputLevel(): number {
  return companionSession.outputLevel();
}
