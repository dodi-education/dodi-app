/**
 * Agent task type definitions.
 *
 * Defines the request/response shapes for the coding agent API.
 */

export type AgentTaskType = "generate_game" | "update_game" | "read_game_state";

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export interface GenerateGamePayload {
  prompt: string;
  title?: string;
  subject?: string;
  difficulty?: string;
  tags?: string[];
}

export interface UpdateGamePayload {
  instruction: string;
  existingCode: string;
  existingMarkdown?: string;
  title?: string;
}

export interface ReadGameStatePayload {
  gameState: Record<string, unknown>;
  question: string;
  gameMarkdown?: string;
  gameCodeBundle?: string;
  snapshot?: string;
}

export interface AgentTaskRequest {
  profileId: string;
  taskType: AgentTaskType;
  gameId?: string;
  childContext: {
    name: string;
    age?: number;
    language: string;
  };
  payload: GenerateGamePayload | UpdateGamePayload | ReadGameStatePayload;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface AgentCodeResult {
  taskType: "generate_game" | "update_game";
  title: string;
  description: string;
  subject: string;
  difficulty: string;
  tags: string[];
  codeBundle: string;
  markdown: string;
  metadata: Record<string, unknown>;
  validationPassed: boolean;
  iterationCount: number;
  /** Game ID after server-side persistence (create or update). */
  savedGameId?: string;
}

export interface AgentAnalysisResult {
  taskType: "read_game_state";
  analysis: string;
}

export type AgentTaskResult = AgentCodeResult | AgentAnalysisResult;
