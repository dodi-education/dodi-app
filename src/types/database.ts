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
          subscription_tier: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          encrypted_api_keys?: Json | null;
          model_config?: Json | null;
          subscription_tier?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          encrypted_api_keys?: Json | null;
          model_config?: Json | null;
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
          name_tag: string;
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
          name_tag: string;
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
          name_tag?: string;
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
          subject: string;
          difficulty: string;
          target_age_min: number;
          target_age_max: number;
          estimated_duration_minutes: number;
          tags: string[];
          code_bundle: string;
          markdown: string;
          metadata: Json;
          created_by: "system" | "ai" | "kid";
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
          subject?: string;
          difficulty?: string;
          target_age_min?: number;
          target_age_max?: number;
          estimated_duration_minutes?: number;
          tags?: string[];
          code_bundle: string;
          markdown?: string;
          metadata?: Json;
          created_by?: "system" | "ai" | "kid";
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
          subject?: string;
          difficulty?: string;
          target_age_min?: number;
          target_age_max?: number;
          estimated_duration_minutes?: number;
          tags?: string[];
          code_bundle?: string;
          markdown?: string;
          metadata?: Json;
          created_by?: "system" | "ai" | "kid";
          created_at?: string;
          updated_at?: string;
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
export type SystemLog = Database["public"]["Tables"]["system_logs"]["Row"];
export type SystemLogInsert =
  Database["public"]["Tables"]["system_logs"]["Insert"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type PersonaInsert = Database["public"]["Tables"]["personas"]["Insert"];
export type PersonaUpdate = Database["public"]["Tables"]["personas"]["Update"];
export type GameInsert = Database["public"]["Tables"]["games"]["Insert"];
export type GameUpdate = Database["public"]["Tables"]["games"]["Update"];
