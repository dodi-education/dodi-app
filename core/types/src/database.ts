// Manual database types — will be replaced with auto-generated types
// once a Supabase project is created and `npx supabase gen types typescript` is run.

import type { ProgressKind, SuccessCriteria } from "./success";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          email: string;
          encrypted_api_keys: Json | null;
          model_config: Json | null;
          vault_keys: Json | null;
          subscription_tier: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          encrypted_api_keys?: Json | null;
          model_config?: Json | null;
          vault_keys?: Json | null;
          subscription_tier?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          encrypted_api_keys?: Json | null;
          model_config?: Json | null;
          vault_keys?: Json | null;
          subscription_tier?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          account_id: string;
          display_name: string;
          social_id: string;
          birthdate: string | null;
          avatar_config: Json | null;
          active_persona_id: string | null;
          memory: string | null;
          parent_notes: string | null;
          language: string;
          first_interaction: boolean;
          preferences: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          display_name: string;
          social_id: string;
          birthdate?: string | null;
          avatar_config?: Json | null;
          active_persona_id?: string | null;
          memory?: string | null;
          parent_notes?: string | null;
          language?: string;
          first_interaction?: boolean;
          preferences?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          display_name?: string;
          social_id?: string;
          birthdate?: string | null;
          avatar_config?: Json | null;
          active_persona_id?: string | null;
          memory?: string | null;
          parent_notes?: string | null;
          language?: string;
          first_interaction?: boolean;
          preferences?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      personas: {
        Row: {
          id: string;
          account_id: string | null;
          name: string;
          soul: string;
          is_system_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          name: string;
          soul: string;
          is_system_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          name?: string;
          soul?: string;
          is_system_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          account_id: string | null;
          profile_id: string | null;
          source_game_id: string | null;
          system_key: string | null;
          is_system: boolean;
          title: string;
          description: string;
          target_age_min: number;
          target_age_max: number;
          estimated_duration_minutes: number;
          tags: string[];
          code_bundle: string;
          markdown: string;
          learning_goal: string;
          success_definition: string;
          success_criteria: Json;
          progress_kind: "goal" | "open";
          metadata: Json;
          is_active: boolean;
          created_by: "system" | "parent" | "kid";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          profile_id?: string | null;
          source_game_id?: string | null;
          system_key?: string | null;
          is_system?: boolean;
          title: string;
          description?: string;
          target_age_min?: number;
          target_age_max?: number;
          estimated_duration_minutes?: number;
          tags?: string[];
          code_bundle: string;
          markdown?: string;
          learning_goal?: string;
          success_definition?: string;
          success_criteria?: Json;
          progress_kind?: "goal" | "open";
          metadata?: Json;
          is_active?: boolean;
          created_by?: "system" | "parent" | "kid";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          profile_id?: string | null;
          source_game_id?: string | null;
          system_key?: string | null;
          is_system?: boolean;
          title?: string;
          description?: string;
          target_age_min?: number;
          target_age_max?: number;
          estimated_duration_minutes?: number;
          tags?: string[];
          code_bundle?: string;
          markdown?: string;
          learning_goal?: string;
          success_definition?: string;
          success_criteria?: Json;
          progress_kind?: "goal" | "open";
          metadata?: Json;
          is_active?: boolean;
          created_by?: "system" | "parent" | "kid";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_plays: {
        Row: {
          id: string;
          account_id: string;
          profile_id: string;
          game_id: string;
          progress_kind: "goal" | "open";
          started_at: string;
          ended_at: string | null;
          succeeded: boolean;
          succeeded_at: string | null;
          final_progress: number;
          metrics: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          profile_id: string;
          game_id: string;
          progress_kind?: "goal" | "open";
          started_at?: string;
          ended_at?: string | null;
          succeeded?: boolean;
          succeeded_at?: string | null;
          final_progress?: number;
          metrics?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          profile_id?: string;
          game_id?: string;
          progress_kind?: "goal" | "open";
          started_at?: string;
          ended_at?: string | null;
          succeeded?: boolean;
          succeeded_at?: string | null;
          final_progress?: number;
          metrics?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_sharings: {
        Row: {
          id: string;
          game_id: string;
          account_id: string;
          profile_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          account_id: string;
          profile_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          account_id?: string;
          profile_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      game_translations: {
        Row: {
          id: string;
          game_id: string;
          locale: string;
          title: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          locale: string;
          title: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          locale?: string;
          title?: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_sessions: {
        Row: {
          id: string;
          account_id: string;
          profile_id: string;
          task_type: string;
          task_prompt: string;
          dodi_context: string;
          status: string;
          progress: string;
          result: Json | null;
          error: string | null;
          game_id: string | null;
          created_at: string;
          updated_at: string;
          finished_at: string | null;
          deactivated_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          profile_id: string;
          task_type: string;
          task_prompt?: string;
          dodi_context?: string;
          status?: string;
          progress?: string;
          result?: Json | null;
          error?: string | null;
          game_id?: string | null;
          created_at?: string;
          updated_at?: string;
          finished_at?: string | null;
          deactivated_at?: string | null;
        };
        Update: {
          id?: string;
          account_id?: string;
          profile_id?: string;
          task_type?: string;
          task_prompt?: string;
          dodi_context?: string;
          status?: string;
          progress?: string;
          result?: Json | null;
          error?: string | null;
          game_id?: string | null;
          created_at?: string;
          updated_at?: string;
          finished_at?: string | null;
          deactivated_at?: string | null;
        };
        Relationships: [];
      };
      system_logs: {
        Row: {
          id: string;
          profile_id: string;
          account_id: string;
          persona_id: string | null;
          event: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          account_id: string;
          persona_id?: string | null;
          event: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          account_id?: string;
          persona_id?: string | null;
          event?: string;
          message?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      subscription_tier: "free" | "premium";
    };
    CompositeTypes: Record<string, never>;
  };
}

// Convenience type aliases
export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Persona = Database["public"]["Tables"]["personas"]["Row"];
export type Game = Database["public"]["Tables"]["games"]["Row"];
export type GamePlay = Database["public"]["Tables"]["game_plays"]["Row"];
export type GamePlayInsert =
  Database["public"]["Tables"]["game_plays"]["Insert"];
export type GamePlayUpdate =
  Database["public"]["Tables"]["game_plays"]["Update"];
export type SystemLog = Database["public"]["Tables"]["system_logs"]["Row"];
export type SystemLogInsert =
  Database["public"]["Tables"]["system_logs"]["Insert"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type PersonaInsert = Database["public"]["Tables"]["personas"]["Insert"];
export type PersonaUpdate = Database["public"]["Tables"]["personas"]["Update"];
export type GameInsert = Database["public"]["Tables"]["games"]["Insert"];
export type GameUpdate = Database["public"]["Tables"]["games"]["Update"];
export type GameSharing =
  Database["public"]["Tables"]["game_sharings"]["Row"];
export type GameSharingInsert =
  Database["public"]["Tables"]["game_sharings"]["Insert"];
export type GameSharingUpdate =
  Database["public"]["Tables"]["game_sharings"]["Update"];
export type GameTranslation =
  Database["public"]["Tables"]["game_translations"]["Row"];

export type AgentSessionRow =
  Database["public"]["Tables"]["agent_sessions"]["Row"];
export type AgentSessionInsert =
  Database["public"]["Tables"]["agent_sessions"]["Insert"];
export type AgentSessionUpdate =
  Database["public"]["Tables"]["agent_sessions"]["Update"];

/** Shape of the `result` JSONB column on agent_sessions. */
export interface AgentSessionResult {
  title: string;
  description: string;
  tags: string[];
  codeBundle: string;
  markdown: string;
  metadata: Record<string, unknown>;
  learningGoal: string;
  successDefinition: string;
  successCriteria: SuccessCriteria;
  progressKind: ProgressKind;
  /** Short, friendly recap of what the agent built or changed (bullet lines). */
  changeSummary: string;
  validationPassed: boolean;
  iterationCount: number;
}
