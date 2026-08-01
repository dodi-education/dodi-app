/**
 * Agent task type definitions.
 *
 * Defines the request/response shapes for the coding agent API.
 */

import type { GamePerspective } from "./games";
import type { ProgressKind, SuccessCriteria } from "./success";
import type { TokenUsage } from "./usage";

export type AgentTaskType = "generate_game" | "update_game";

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export interface GenerateGamePayload {
  prompt: string;
  title?: string;
  tags?: string[];
  /** Parent's plain-language learning goal (what the game should help with). */
  learningGoal?: string;
  /** Parent's plain-language success definition (how Dodi knows the child succeeded). */
  successDefinition?: string;
  /** Required camera perspective for the design (absent = agent chooses). */
  perspective?: GamePerspective;
  /** Parent-attached reference images (data URLs) — visual guidance for the design. */
  images?: string[];
}

export interface UpdateGamePayload {
  instruction: string;
  existingCode: string;
  existingMarkdown?: string;
  title?: string;
  learningGoal?: string;
  successDefinition?: string;
  /** Required camera perspective for the design (absent = agent chooses). */
  perspective?: GamePerspective;
  /** Parent-attached reference images (data URLs) — visual guidance for the design. */
  images?: string[];
  /** Screenshot (data URL) of the game as it currently looks — attached first. */
  screenshot?: string;
}

export interface AgentTaskRequest {
  kidId: string;
  taskType: AgentTaskType;
  gameId?: string;
  childContext: {
    name: string;
    age?: number;
    language: string;
    /**
     * Scrubbing-free learning context (memory + parent notes) for the audience
     * kid(s), used to shape game design. Never echoed verbatim into game content.
     */
    learningContext?: string;
  };
  payload: GenerateGamePayload | UpdateGamePayload;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface AgentCodeResult {
  taskType: "generate_game" | "update_game";
  title: string;
  description: string;
  tags: string[];
  codeBundle: string;
  markdown: string;
  /**
   * Generated (or carried-over) background image as a data URL. The codeBundle
   * references it via the {{BACKGROUND_IMAGE}} placeholder — callers inject it
   * (injectBackgroundImage) before rendering/persisting.
   */
  backgroundImage?: string;
  /** An image-generation attempt threw during the run (studio shows a notice). */
  backgroundImageFailed?: boolean;
  /**
   * AI-generated game-list preview (square data URL, already cropped to the
   * list size by the client callback). Present when the game's "preview image"
   * setting is on and the agent's generate_preview_image call succeeded.
   */
  previewImage?: string;
  /** A preview-image generation attempt threw during the run. */
  previewImageFailed?: boolean;
  /**
   * The run only regenerated the preview image (parent asked for a new one in
   * chat) — code, markdown and every other field are the UNCHANGED existing
   * values and must not be re-persisted as a content update.
   */
  previewOnly?: boolean;
  metadata: Record<string, unknown>;
  learningGoal: string;
  successDefinition: string;
  successCriteria: SuccessCriteria;
  progressKind: ProgressKind;
  /** Short, friendly recap of what the agent built or changed (bullet lines). */
  changeSummary: string;
  validationPassed: boolean;
  iterationCount: number;
  /** Number of post-generation validation-fix retries used. */
  validationRetries: number;
  /** Accumulated token usage across every agent + validation call. */
  usage: TokenUsage;
  /** Game ID after server-side persistence (create or update). */
  savedGameId?: string;
  /** Set when the game was generated but could not be saved (surfaced to the user). */
  saveError?: string;
}
