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
          date_preferences: Json | null;
          language: string;
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
          date_preferences?: Json | null;
          language?: string;
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
          date_preferences?: Json | null;
          language?: string;
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
          // E2EE: enc:v1: JSON string { color, avatar } in memory after decrypt.
          avatar_config: Json | null;
          // E2EE: enc:v1: JSON array of 3 avatar ids; null = puzzle disabled.
          avatar_pin: string | null;
          active_persona_id: string | null;
          memory: string | null;
          parent_notes: string | null;
          language: string;
          date_preferences: Json | null;
          // Friend identity: public halves plaintext; secret halves sealed
          // under the account VMK (friend_secret_keys, enc:v1:, server-blind).
          friend_kem_public_key: string | null;
          friend_sign_public_key: string | null;
          friend_secret_keys: string | null;
          // Parent-controlled per-kid friend settings (plaintext, enforceable).
          can_add_friends: boolean;
          can_be_added_as_friend: boolean;
          incoming_friend_requests_require_parent_approval: boolean;
          outgoing_friend_requests_require_parent_approval: boolean;
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
          avatar_pin?: string | null;
          active_persona_id?: string | null;
          memory?: string | null;
          parent_notes?: string | null;
          language?: string;
          date_preferences?: Json | null;
          friend_kem_public_key?: string | null;
          friend_sign_public_key?: string | null;
          friend_secret_keys?: string | null;
          can_add_friends?: boolean;
          can_be_added_as_friend?: boolean;
          incoming_friend_requests_require_parent_approval?: boolean;
          outgoing_friend_requests_require_parent_approval?: boolean;
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
          avatar_pin?: string | null;
          active_persona_id?: string | null;
          memory?: string | null;
          parent_notes?: string | null;
          language?: string;
          date_preferences?: Json | null;
          friend_kem_public_key?: string | null;
          friend_sign_public_key?: string | null;
          friend_secret_keys?: string | null;
          can_add_friends?: boolean;
          can_be_added_as_friend?: boolean;
          incoming_friend_requests_require_parent_approval?: boolean;
          outgoing_friend_requests_require_parent_approval?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_account_id: string;
          requester_profile_id: string;
          addressee_account_id: string;
          addressee_profile_id: string;
          status: string;
          addressee_accepted: boolean;
          // tri-state: null = approval not required, false = required+pending,
          // true = approved.
          requester_parent_ok: boolean | null;
          addressee_parent_ok: boolean | null;
          blocked_by: string | null;
          // Sealed SealedEnvelope JSON (opaque to the server).
          requester_preview_card: string | null;
          requester_card: string | null;
          addressee_card: string | null;
          // Requester's private nickname for this friend (enc:v1: under their VMK).
          nickname: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_account_id: string;
          requester_profile_id: string;
          addressee_account_id: string;
          addressee_profile_id: string;
          status?: string;
          addressee_accepted?: boolean;
          requester_parent_ok?: boolean | null;
          addressee_parent_ok?: boolean | null;
          blocked_by?: string | null;
          requester_preview_card?: string | null;
          requester_card?: string | null;
          addressee_card?: string | null;
          nickname?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_account_id?: string;
          requester_profile_id?: string;
          addressee_account_id?: string;
          addressee_profile_id?: string;
          status?: string;
          addressee_accepted?: boolean;
          requester_parent_ok?: boolean | null;
          addressee_parent_ok?: boolean | null;
          blocked_by?: string | null;
          requester_preview_card?: string | null;
          requester_card?: string | null;
          addressee_card?: string | null;
          nickname?: string | null;
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
      devices: {
        Row: {
          id: string;
          account_id: string | null;
          device_id: string;
          name: string | null;
          kem_public_key: string;
          sign_public_key: string;
          status: string;
          pairing_code: string | null;
          enrolled_at: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          device_id: string;
          name?: string | null;
          kem_public_key: string;
          sign_public_key: string;
          status?: string;
          pairing_code?: string | null;
          enrolled_at?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          device_id?: string;
          name?: string | null;
          kem_public_key?: string;
          sign_public_key?: string;
          status?: string;
          pairing_code?: string | null;
          enrolled_at?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
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
export type Device = Database["public"]["Tables"]["devices"]["Row"];
export type DeviceInsert = Database["public"]["Tables"]["devices"]["Insert"];
export type DeviceUpdate = Database["public"]["Tables"]["devices"]["Update"];
export type DeviceStatus = "pending" | "active" | "revoked";
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type Friendship = Database["public"]["Tables"]["friendships"]["Row"];
export type FriendshipInsert =
  Database["public"]["Tables"]["friendships"]["Insert"];
export type FriendshipUpdate =
  Database["public"]["Tables"]["friendships"]["Update"];

/** Lifecycle of a friendship. See @dodi/protocol friend-card + friends service. */
export type FriendshipStatus =
  | "pending"
  | "awaiting_parent"
  | "accepted"
  | "rejected"
  | "blocked";

/**
 * The minimal identity a kid reveals with a friend *request* — shown to the
 * addressee so they can decide. Sealed to the addressee's profile KEM key.
 */
export interface FriendPreviewCard {
  displayName: string;
  avatarConfig: Json | null;
}

/**
 * The full card exchanged once a friendship is `accepted` — adds birthdate.
 * Sealed to the recipient profile's KEM key; server gates delivery by status.
 */
export interface FriendCard extends FriendPreviewCard {
  birthdate: string | null;
}

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
