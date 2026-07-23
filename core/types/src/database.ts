// Manual database types — will be replaced with auto-generated types
// once a Supabase project is created and `npx supabase gen types typescript` is run.

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
          // E2EE: enc:v1: sealed 4-digit parent PIN; null = no PIN set.
          parent_pin_enc: string | null;
          // Plaintext (NOT E2EE) account-level notification toggles; the server
          // reads these to decide whether to send transactional email.
          notification_preferences: Json;
          language: string;
          // Handle of the subscribed plan (FK → platform_plans.handle).
          subscribed_plan: string;
          // Entitlements copied from the plan; enforcement reads THESE columns so a
          // single account's caps can be raised without inventing a new plan.
          // max_kids NULL = unlimited (every plan today); a number caps this account.
          max_kids: number | null;
          max_custom_personas: number;
          max_storage_mb_per_kid: number;
          memory_tier: "basic" | "advanced" | "full";
          // Deliberately PUBLIC author byline for dodi Discover (like kids.social_id).
          // Lowercase [a-z0-9_], 3-15 chars, unique. Null until the first publish.
          publication_handle: string | null;
          /** Max publication submissions per UTC calendar month (every submit counts). */
          monthly_game_publication_limit: number;
          /** Stamped once when any submission is hard-rejected; never auto-cleared. */
          flagged_for_review_at: string | null;
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
          parent_pin_enc?: string | null;
          notification_preferences?: Json;
          language?: string;
          subscribed_plan?: string;
          max_kids?: number | null;
          max_custom_personas?: number;
          max_storage_mb_per_kid?: number;
          memory_tier?: "basic" | "advanced" | "full";
          publication_handle?: string | null;
          monthly_game_publication_limit?: number;
          flagged_for_review_at?: string | null;
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
          parent_pin_enc?: string | null;
          notification_preferences?: Json;
          language?: string;
          subscribed_plan?: string;
          max_kids?: number | null;
          max_custom_personas?: number;
          max_storage_mb_per_kid?: number;
          memory_tier?: "basic" | "advanced" | "full";
          publication_handle?: string | null;
          monthly_game_publication_limit?: number;
          flagged_for_review_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      kids: {
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
          // Persisted deaf state: NULL = Dodi listens normally; a timestamp means
          // the kid muted Dodi, so she comes up deaf on connect until re-enabled.
          deafened_dodi_at: string | null;
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
          deafened_dodi_at?: string | null;
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
          deafened_dodi_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_account_id: string;
          requester_kid_id: string;
          addressee_account_id: string;
          addressee_kid_id: string;
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
          requester_kid_id: string;
          addressee_account_id: string;
          addressee_kid_id: string;
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
          requester_kid_id?: string;
          addressee_account_id?: string;
          addressee_kid_id?: string;
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
          kid_id: string | null;
          source_game_id: string | null;
          system_key: string | null;
          is_system: boolean;
          // E2EE: the eight content fields below carry enc:v1: records for private
          // games, and PLAINTEXT for system games and publication copies — see
          // `isEncryptableGame` in @dodi/vault/game-crypto for the single predicate.
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
          /** enc:v1: JSON *string* scalar when sealed; a plain object when not. */
          success_criteria: Json;
          progress_kind: "goal" | "open";
          metadata: Json;
          is_active: boolean;
          created_by: "system" | "parent" | "kid";
          /** enc:v1: sealed JSON of the studio conversation (user + dodi messages); server-blind. */
          agent_transcript_enc: string | null;
          /** Optional 100x100 kid-library preview (system SVG path, or NULL ⇒ icon). */
          preview_image: string | null;
          /** Head of the game_versions chain (its code_bundle matches). NULL = system game or pre-versioning code. */
          current_game_version_id: string | null;
          /** Set on a publication COPY at submit time. Non-NULL ⇒ this row is plaintext. */
          publication_requested_at: string | null;
          /** Stamped by the review pass once the submission is approved. */
          published_at: string | null;
          approved_by: "system" | "admin" | null;
          /** Authorship (SET NULL), as opposed to account_id which is ownership (CASCADE). */
          published_by_account_id: string | null;
          /** Stamped by the review pass on rejection; cleared on resubmit. */
          rejected_at: string | null;
          /** hard = permanent (source can never be resubmitted); soft = demand changes. */
          rejection_kind: "hard" | "soft" | null;
          /** Array of {code, note} — codes from @dodi/protocol/publication-review. */
          rejection_reasons: Json | null;
          /** Review attempts consumed; doubles as the worker's optimistic claim token. */
          review_attempts: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          kid_id?: string | null;
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
          agent_transcript_enc?: string | null;
          preview_image?: string | null;
          current_game_version_id?: string | null;
          publication_requested_at?: string | null;
          published_at?: string | null;
          approved_by?: "system" | "admin" | null;
          published_by_account_id?: string | null;
          rejected_at?: string | null;
          rejection_kind?: "hard" | "soft" | null;
          rejection_reasons?: Json | null;
          review_attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          kid_id?: string | null;
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
          agent_transcript_enc?: string | null;
          preview_image?: string | null;
          current_game_version_id?: string | null;
          publication_requested_at?: string | null;
          published_at?: string | null;
          approved_by?: "system" | "admin" | null;
          published_by_account_id?: string | null;
          rejected_at?: string | null;
          rejection_kind?: "hard" | "soft" | null;
          rejection_reasons?: Json | null;
          review_attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_versions: {
        Row: {
          id: string;
          game_id: string;
          account_id: string;
          /** enc:v1: — copied verbatim from games.code_bundle, so history inherits its encryption state. */
          code_bundle: string;
          /** Backward chain link; NULL = first version of the game. */
          previous_game_version_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          account_id: string;
          code_bundle: string;
          previous_game_version_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          account_id?: string;
          code_bundle?: string;
          previous_game_version_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      game_plays: {
        Row: {
          id: string;
          account_id: string;
          kid_id: string;
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
          kid_id: string;
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
          kid_id?: string;
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
      game_publication_requests: {
        Row: {
          id: string;
          account_id: string;
          /** The private E2EE source game (SET NULL — the log outlives the game). */
          source_game_id: string | null;
          /** The plaintext publication copy (SET NULL — survives withdraw). */
          publication_game_id: string | null;
          requested_at: string;
          /** NULL while undecided (pending review or withdrawn before a verdict). */
          outcome: "approved" | "rejected" | null;
          rejection_kind: "hard" | "soft" | null;
          /** Array of {code, note} — codes from @dodi/protocol/publication-review. */
          rejection_reasons: Json | null;
          decided_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          source_game_id?: string | null;
          publication_game_id?: string | null;
          requested_at?: string;
          outcome?: "approved" | "rejected" | null;
          rejection_kind?: "hard" | "soft" | null;
          rejection_reasons?: Json | null;
          decided_at?: string | null;
        };
        Update: {
          id?: string;
          account_id?: string;
          source_game_id?: string | null;
          publication_game_id?: string | null;
          requested_at?: string;
          outcome?: "approved" | "rejected" | null;
          rejection_kind?: "hard" | "soft" | null;
          rejection_reasons?: Json | null;
          decided_at?: string | null;
        };
        Relationships: [];
      };
      game_snapshots: {
        Row: {
          id: string;
          account_id: string;
          kid_id: string;
          game_id: string | null;
          origin: "own" | "received" | "autosave";
          sender_kid_id: string | null;
          friendship_id: string | null;
          shared_with_kid_id: string | null;
          info_enc: string;
          payload_enc: string;
          payload_bytes: number;
          viewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          kid_id: string;
          game_id?: string | null;
          origin?: "own" | "received" | "autosave";
          sender_kid_id?: string | null;
          friendship_id?: string | null;
          shared_with_kid_id?: string | null;
          info_enc: string;
          payload_enc: string;
          payload_bytes?: number;
          viewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          kid_id?: string;
          game_id?: string | null;
          origin?: "own" | "received" | "autosave";
          sender_kid_id?: string | null;
          friendship_id?: string | null;
          shared_with_kid_id?: string | null;
          info_enc?: string;
          payload_enc?: string;
          payload_bytes?: number;
          viewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_usage_logs: {
        Row: {
          id: string;
          account_id: string;
          kid_id: string | null;
          game_id: string | null;
          event_type:
            | "game_create"
            | "game_edit"
            | "game_analysis"
            | "memory_update"
            | "voice_minutes";
          provider: string;
          model: string;
          input_tokens: number | null;
          output_tokens: number | null;
          cache_write_tokens: number | null;
          cache_read_tokens: number | null;
          voice_seconds: number | null;
          meta_turns: number | null;
          meta_validation_retries: number | null;
          meta_output_chars: number | null;
          meta_memory_chars: number | null;
          meta_parent_notes_chars: number | null;
          meta_learning_goal_chars: number | null;
          meta_success_def_chars: number | null;
          meta_prompt_chars: number | null;
          meta_tags_chars: number | null;
          meta_persona_chars: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          kid_id?: string | null;
          game_id?: string | null;
          event_type:
            | "game_create"
            | "game_edit"
            | "game_analysis"
            | "memory_update"
            | "voice_minutes";
          provider: string;
          model: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_write_tokens?: number | null;
          cache_read_tokens?: number | null;
          voice_seconds?: number | null;
          meta_turns?: number | null;
          meta_validation_retries?: number | null;
          meta_output_chars?: number | null;
          meta_memory_chars?: number | null;
          meta_parent_notes_chars?: number | null;
          meta_learning_goal_chars?: number | null;
          meta_success_def_chars?: number | null;
          meta_prompt_chars?: number | null;
          meta_tags_chars?: number | null;
          meta_persona_chars?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          kid_id?: string | null;
          game_id?: string | null;
          event_type?:
            | "game_create"
            | "game_edit"
            | "game_analysis"
            | "memory_update"
            | "voice_minutes";
          provider?: string;
          model?: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_write_tokens?: number | null;
          cache_read_tokens?: number | null;
          voice_seconds?: number | null;
          meta_turns?: number | null;
          meta_validation_retries?: number | null;
          meta_output_chars?: number | null;
          meta_memory_chars?: number | null;
          meta_parent_notes_chars?: number | null;
          meta_learning_goal_chars?: number | null;
          meta_success_def_chars?: number | null;
          meta_prompt_chars?: number | null;
          meta_tags_chars?: number | null;
          meta_persona_chars?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      error_logs: {
        Row: {
          id: string;
          account_id: string | null;
          kid_id: string | null;
          game_id: string | null;
          type: "client" | "server";
          context: string;
          provider: string | null;
          model: string | null;
          error_name: string | null;
          error_message: string | null;
          http_status: number | null;
          meta: Json | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          kid_id?: string | null;
          game_id?: string | null;
          type: "client" | "server";
          context: string;
          provider?: string | null;
          model?: string | null;
          error_name?: string | null;
          error_message?: string | null;
          http_status?: number | null;
          meta?: Json | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          kid_id?: string | null;
          game_id?: string | null;
          type?: "client" | "server";
          context?: string;
          provider?: string | null;
          model?: string | null;
          error_name?: string | null;
          error_message?: string | null;
          http_status?: number | null;
          meta?: Json | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      game_sharings: {
        Row: {
          id: string;
          game_id: string;
          account_id: string;
          kid_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          account_id: string;
          kid_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          account_id?: string;
          kid_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      game_favorites: {
        Row: {
          id: string;
          account_id: string;
          kid_id: string;
          game_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          kid_id: string;
          game_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          kid_id?: string;
          game_id?: string;
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
      activities: {
        Row: {
          id: string;
          kid_id: string;
          account_id: string;
          persona_id: string | null;
          event: string;
          /**
           * PLAINTEXT — never write an E2EE value here (a game title, a kid's
           * name). Reference the entity instead and resolve it client-side.
           */
          message: string;
          /** Soft reference so the feed can name a game whose title is E2EE. */
          game_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          kid_id: string;
          account_id: string;
          persona_id?: string | null;
          event: string;
          message: string;
          game_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          kid_id?: string;
          account_id?: string;
          persona_id?: string | null;
          event?: string;
          message?: string;
          game_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transcripts: {
        Row: {
          id: string;
          account_id: string;
          kid_id: string;
          local_date: string;
          persona_id: string | null;
          status: "open" | "processed";
          content_enc: string | null;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          kid_id: string;
          local_date: string;
          persona_id?: string | null;
          status?: "open" | "processed";
          content_enc?: string | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          kid_id?: string;
          local_date?: string;
          persona_id?: string | null;
          status?: "open" | "processed";
          content_enc?: string | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transcript_entries: {
        Row: {
          id: string;
          transcript_id: string;
          account_id: string;
          kid_id: string;
          role: "dodi" | "kid";
          content_enc: string;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          transcript_id: string;
          account_id: string;
          kid_id: string;
          role: "dodi" | "kid";
          content_enc: string;
          occurred_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          transcript_id?: string;
          account_id?: string;
          kid_id?: string;
          role?: "dodi" | "kid";
          content_enc?: string;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      memories: {
        Row: {
          id: string;
          account_id: string;
          kid_id: string;
          content_enc: string;
          category: string | null;
          status: "active" | "discarded";
          created_at: string;
          discarded_at: string | null;
          discarded_by: "system" | "parent" | null;
          discard_memory_source_id: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          kid_id: string;
          content_enc: string;
          category?: string | null;
          status?: "active" | "discarded";
          created_at?: string;
          discarded_at?: string | null;
          discarded_by?: "system" | "parent" | null;
          discard_memory_source_id?: string | null;
        };
        Update: {
          id?: string;
          account_id?: string;
          kid_id?: string;
          content_enc?: string;
          category?: string | null;
          status?: "active" | "discarded";
          created_at?: string;
          discarded_at?: string | null;
          discarded_by?: "system" | "parent" | null;
          discard_memory_source_id?: string | null;
        };
        Relationships: [];
      };
      memory_sources: {
        Row: {
          id: string;
          memory_id: string;
          transcript_entry_id: string;
          relation: "supports" | "contradicts";
          created_at: string;
        };
        Insert: {
          id?: string;
          memory_id: string;
          transcript_entry_id: string;
          relation: "supports" | "contradicts";
          created_at?: string;
        };
        Update: {
          id?: string;
          memory_id?: string;
          transcript_entry_id?: string;
          relation?: "supports" | "contradicts";
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
      invite_codes: {
        Row: {
          id: string;
          code: string;
          is_active: boolean;
          // null = unlimited uses while active (reserved for future limits).
          max_uses: number | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          is_active?: boolean;
          max_uses?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          is_active?: boolean;
          max_uses?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invite_code_redemptions: {
        Row: {
          id: string;
          invite_code_id: string;
          account_id: string;
          redeemed_at: string;
        };
        Insert: {
          id?: string;
          invite_code_id: string;
          account_id: string;
          redeemed_at?: string;
        };
        Update: {
          id?: string;
          invite_code_id?: string;
          account_id?: string;
          redeemed_at?: string;
        };
        Relationships: [];
      };
      newsletter_signups: {
        Row: {
          id: string;
          email: string;
          locale: string;
          // Which newsletter/list this signup is for (validated against the
          // NEWSLETTER_LISTS env in the app), e.g. "newsletter".
          list: string;
          status: string;
          // HMAC-SHA256(ip, pepper) — never the raw IP. Null when unknown.
          ip_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          locale?: string;
          list?: string;
          status?: string;
          ip_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          locale?: string;
          list?: string;
          status?: string;
          ip_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_plans: {
        Row: {
          id: string;
          handle: string;
          title: string;
          sort_order: number;
          price_eur_month: number;
          is_active: boolean;
          max_kids: number | null;
          max_custom_personas: number;
          max_storage_mb_per_kid: number;
          memory_tier: "basic" | "advanced" | "full";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          handle: string;
          title: string;
          sort_order?: number;
          price_eur_month?: number;
          is_active?: boolean;
          max_kids: number | null;
          max_custom_personas: number;
          max_storage_mb_per_kid: number;
          memory_tier: "basic" | "advanced" | "full";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          handle?: string;
          title?: string;
          sort_order?: number;
          price_eur_month?: number;
          is_active?: boolean;
          max_kids?: number | null;
          max_custom_personas?: number;
          max_storage_mb_per_kid?: number;
          memory_tier?: "basic" | "advanced" | "full";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_plan_translations: {
        Row: {
          id: string;
          plan_id: string;
          locale: string;
          title: string;
          tagline: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          locale: string;
          title: string;
          tagline?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          locale?: string;
          title?: string;
          tagline?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_config: {
        Row: {
          key: string;
          value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // Records an invite-code redemption for an active code; returns whether it
      // was recorded. Called by the handle_new_user() trigger / service role.
      redeem_invite_code: {
        Args: { p_code: string; p_account_id: string };
        Returns: boolean;
      };
      // Read-only check: is there an active invite code with this value?
      // Used by the platform's before_user_created hook (service role).
      is_invite_code_active: {
        Args: { p_code: string };
        Returns: boolean;
      };
      // Atomically rate-limit (per ip_hash within p_window) and idempotently
      // insert a newsletter signup. Returns exactly one row: the signup id (null
      // when rate-limited), whether a new row was created, and whether the
      // per-IP cap was hit. Called by the public /api/newsletter route (service role).
      record_newsletter_signup: {
        Args: {
          p_email: string;
          p_locale: string;
          p_list: string;
          p_ip_hash: string | null;
          p_max_per_ip: number;
          p_window: string;
        };
        Returns: {
          id: string | null;
          is_new: boolean;
          rate_limited: boolean;
        }[];
      };
      // Per-game play & copy counts for a set of published games, in one round
      // trip. plays = game_plays on the row (play-in-place aggregates every
      // family's plays there); copies = private remixes pointing back via
      // source_game_id. Reads across families — service role only. Powers the
      // Discover catalog stat line (services/discover getGameStats).
      discover_game_stats: {
        Args: { p_game_ids: string[] };
        Returns: { game_id: string; plays: number; copies: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience type aliases
export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type MemoryTier = "basic" | "advanced" | "full";
export type PlatformPlan = Database["public"]["Tables"]["platform_plans"]["Row"];
export type PlatformPlanInsert =
  Database["public"]["Tables"]["platform_plans"]["Insert"];
export type PlatformPlanTranslation =
  Database["public"]["Tables"]["platform_plan_translations"]["Row"];
export type PlatformConfig =
  Database["public"]["Tables"]["platform_config"]["Row"];
export type AiUsageLog = Database["public"]["Tables"]["ai_usage_logs"]["Row"];
export type AiUsageLogInsert =
  Database["public"]["Tables"]["ai_usage_logs"]["Insert"];
/** @deprecated Prefer AiUsageLog — alias kept for gradual call-site updates. */
export type UsageEvent = AiUsageLog;
/** @deprecated Prefer AiUsageLogInsert */
export type UsageEventInsert = AiUsageLogInsert;
export type ErrorLog = Database["public"]["Tables"]["error_logs"]["Row"];
export type ErrorLogInsert =
  Database["public"]["Tables"]["error_logs"]["Insert"];
/**
 * Slim persona projection embedded in kid read shapes ("data travels with the
 * row that owns it"): the API joins it server-side via the active_persona_id
 * FK so clients never fetch /api/personas just to label a kid. Excludes the
 * heavy `soul` doc — AI flows load the full persona at session start. `name`
 * is E2EE ciphertext for account personas (decrypted in decryptKid).
 */
export interface KidActivePersona {
  id: string;
  name: string;
  account_id: string | null;
  is_system_default: boolean;
}
/**
 * Kid API read shape: the raw active_persona_id FK is replaced by the embedded
 * `active_persona` object. Write shapes (Insert/Update) still take the id.
 */
export type Kid = Omit<
  Database["public"]["Tables"]["kids"]["Row"],
  "active_persona_id"
> & { active_persona: KidActivePersona | null };
export type Persona = Database["public"]["Tables"]["personas"]["Row"];
export type Game = Database["public"]["Tables"]["games"]["Row"];
export type GamePlay = Database["public"]["Tables"]["game_plays"]["Row"];
export type GamePlayInsert =
  Database["public"]["Tables"]["game_plays"]["Insert"];
export type GamePlayUpdate =
  Database["public"]["Tables"]["game_plays"]["Update"];
export type GameSnapshot =
  Database["public"]["Tables"]["game_snapshots"]["Row"];
export type GameSnapshotInsert =
  Database["public"]["Tables"]["game_snapshots"]["Insert"];
export type GameSnapshotUpdate =
  Database["public"]["Tables"]["game_snapshots"]["Update"];
/** own = saved by the kid; received = sealed to them by a friend (share). */
export type SnapshotOrigin = "own" | "received" | "autosave";
export type Activity = Database["public"]["Tables"]["activities"]["Row"];
export type ActivityInsert =
  Database["public"]["Tables"]["activities"]["Insert"];
/** @deprecated Prefer Activity */
export type EventLog = Activity;
/** @deprecated Prefer ActivityInsert */
export type EventLogInsert = ActivityInsert;

export type Transcript = Database["public"]["Tables"]["transcripts"]["Row"];
export type TranscriptInsert =
  Database["public"]["Tables"]["transcripts"]["Insert"];
export type TranscriptUpdate =
  Database["public"]["Tables"]["transcripts"]["Update"];
export type TranscriptEntry =
  Database["public"]["Tables"]["transcript_entries"]["Row"];
export type TranscriptEntryInsert =
  Database["public"]["Tables"]["transcript_entries"]["Insert"];
export type Memory = Database["public"]["Tables"]["memories"]["Row"];
export type MemoryInsert = Database["public"]["Tables"]["memories"]["Insert"];
export type MemoryUpdate = Database["public"]["Tables"]["memories"]["Update"];
export type MemorySource =
  Database["public"]["Tables"]["memory_sources"]["Row"];
export type MemorySourceInsert =
  Database["public"]["Tables"]["memory_sources"]["Insert"];
export type MemoryRelation = "supports" | "contradicts";
export type MemoryStatus = "active" | "discarded";
export type MemoryDiscardedBy = "system" | "parent";
export type TranscriptStatus = "open" | "processed";
export type TranscriptEntryRole = "dodi" | "kid";

/**
 * Slim transcript-entry projection embedded in memory-source read shapes
 * (?includeSources=1) so dossier citations resolve without a second fetch.
 * content_enc stays E2EE ciphertext; decryption is client-side.
 */
export interface MemorySourceEntryRef {
  id: string;
  role: TranscriptEntryRole;
  content_enc: string;
  occurred_at: string;
}

/** Read shape of a memory source with its cited entry embedded (may be null if the entry row is gone). */
export interface MemorySourceWithEntry extends MemorySource {
  entry: MemorySourceEntryRef | null;
}
export type Device = Database["public"]["Tables"]["devices"]["Row"];
export type DeviceInsert = Database["public"]["Tables"]["devices"]["Insert"];
export type DeviceUpdate = Database["public"]["Tables"]["devices"]["Update"];
export type DeviceStatus = "pending" | "active" | "revoked";

export type InviteCode = Database["public"]["Tables"]["invite_codes"]["Row"];
export type InviteCodeInsert =
  Database["public"]["Tables"]["invite_codes"]["Insert"];
export type InviteCodeUpdate =
  Database["public"]["Tables"]["invite_codes"]["Update"];
export type InviteCodeRedemption =
  Database["public"]["Tables"]["invite_code_redemptions"]["Row"];

export type NewsletterSignup =
  Database["public"]["Tables"]["newsletter_signups"]["Row"];
export type NewsletterSignupInsert =
  Database["public"]["Tables"]["newsletter_signups"]["Insert"];

/** Registration gate controlled by the platform's REGISTRATION_MODE env var. */
export type RegistrationMode = "open" | "invite" | "closed";
export type KidInsert = Database["public"]["Tables"]["kids"]["Insert"];
export type KidUpdate = Database["public"]["Tables"]["kids"]["Update"];

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
 * addressee so they can decide. Sealed to the addressee's kid KEM key.
 */
export interface FriendPreviewCard {
  displayName: string;
  avatarConfig: Json | null;
}

/**
 * The full card exchanged once a friendship is `accepted` — adds birthdate.
 * Sealed to the recipient kid's KEM key; server gates delivery by status.
 */
export interface FriendCard extends FriendPreviewCard {
  birthdate: string | null;
}

export type PersonaInsert = Database["public"]["Tables"]["personas"]["Insert"];
export type PersonaUpdate = Database["public"]["Tables"]["personas"]["Update"];
export type GameInsert = Database["public"]["Tables"]["games"]["Insert"];
export type GameUpdate = Database["public"]["Tables"]["games"]["Update"];
export type GameVersion =
  Database["public"]["Tables"]["game_versions"]["Row"];
export type GameVersionInsert =
  Database["public"]["Tables"]["game_versions"]["Insert"];
export type GameSharing =
  Database["public"]["Tables"]["game_sharings"]["Row"];
export type GameSharingInsert =
  Database["public"]["Tables"]["game_sharings"]["Insert"];
export type GameSharingUpdate =
  Database["public"]["Tables"]["game_sharings"]["Update"];
export type GameFavorite =
  Database["public"]["Tables"]["game_favorites"]["Row"];
export type GameFavoriteInsert =
  Database["public"]["Tables"]["game_favorites"]["Insert"];
export type GameTranslation =
  Database["public"]["Tables"]["game_translations"]["Row"];
export type GamePublicationRequest =
  Database["public"]["Tables"]["game_publication_requests"]["Row"];
export type GamePublicationRequestInsert =
  Database["public"]["Tables"]["game_publication_requests"]["Insert"];
export type GamePublicationRequestUpdate =
  Database["public"]["Tables"]["game_publication_requests"]["Update"];
