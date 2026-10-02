/**
 * Pure rules for the studio's settings save, kept out of the studio screens so
 * they are testable.
 *
 * A planning draft's save with an accepted plan IS the start of the build, so
 * it hands off to the agent view before its first await: the parent watches
 * the save and then the build in the chat instead of staring at a disabled
 * button. It also skips the success-definition mapping. The first build's
 * agent maps the success definition itself and persistBuild writes
 * success_criteria/progress_kind, so mapping before the save was a redundant
 * AI round trip that only blocked the UI (and stalled in a backgrounded tab).
 */

import { isValidAgeRange } from "./age-range";

export interface SettingsSaveInput {
  /** The draft is still on the Plan step's side of its first save. */
  isPlanning: boolean;
  /** A plan was agreed, so this save starts the build. */
  hasAcceptedPlan: boolean;
}

export interface SettingsSavePlan {
  /** This save starts the build: switch to the agent view before any await. */
  isBuildStart: boolean;
  /** Map the success definition to criteria (an AI round trip) before saving. */
  shouldMapSuccessDefinition: boolean;
}

export function planSettingsSave(input: SettingsSaveInput): SettingsSavePlan {
  const isBuildStart = input.isPlanning && input.hasAcceptedPlan;
  return { isBuildStart, shouldMapSuccessDefinition: !isBuildStart };
}

export interface DraftGateInput {
  isPlanning: boolean;
  isPlanMode: boolean;
  /** A build-starting settings save is in flight (the agent view is showing). */
  isStartingBuild: boolean;
}

export interface DraftGate {
  /** The chat pane is gated away (the settings form fills the studio). */
  isPaneLocked: boolean;
  /** The composer takes no input (the draft has not been saved yet). */
  isComposerLocked: boolean;
}

/**
 * Building is locked until the settings are saved (new-game hard gate). While
 * a build-starting save runs, the chat pane opens early so the parent sees the
 * handoff, but the composer stays locked until the save has landed.
 */
export function resolveDraftGate(input: DraftGateInput): DraftGate {
  const locked = input.isPlanning && !input.isPlanMode;
  return { isPaneLocked: locked && !input.isStartingBuild, isComposerLocked: locked };
}

/** The settings fields a save flags red when they are empty or out of range. */
export interface InvalidSettings {
  title?: boolean;
  learningGoal?: boolean;
  audience?: boolean;
  age?: boolean;
}

export interface SettingsValidationInput {
  title: string;
  learningGoal: string;
  targetAgeMin: number;
  targetAgeMax: number;
  /** The kid whose context the studio uses; null = no audience picked. */
  primaryKidId: string | null;
  /** Still planning: the title is mandatory only for a brand-new game. */
  isPlanning: boolean;
}

/**
 * Mandatory settings: a title (brand-new games only), a learning goal, an
 * audience and a valid age range. The server stays permissive so voice and
 * system game creation (which have no parent goal) still work.
 */
export function findInvalidSettings(input: SettingsValidationInput): Required<InvalidSettings> {
  return {
    title: input.isPlanning && !input.title.trim(),
    learningGoal: !input.learningGoal.trim(),
    audience: !input.primaryKidId,
    age: !isValidAgeRange(input.targetAgeMin, input.targetAgeMax),
  };
}

/** The flagged field names, comma separated (for the error report), or "" when valid. */
export function invalidSettingsList(invalid: InvalidSettings): string {
  return (Object.keys(invalid) as Array<keyof InvalidSettings>).filter((k) => invalid[k]).join(",");
}
