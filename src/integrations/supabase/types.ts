export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor_id: string | null
          actor_label: string | null
          created_at: string
          event_type: string
          hash: string
          hospital_id: string | null
          id: string
          model_version: string | null
          payload: Json
          previous_hash: string
          round_number: number | null
          seq: number
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          event_type: string
          hash: string
          hospital_id?: string | null
          id?: string
          model_version?: string | null
          payload?: Json
          previous_hash: string
          round_number?: number | null
          seq?: never
        }
        Update: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          event_type?: string
          hash?: string
          hospital_id?: string | null
          id?: string
          model_version?: string | null
          payload?: Json
          previous_hash?: string
          round_number?: number | null
          seq?: never
        }
        Relationships: []
      }
      dataset_samples: {
        Row: {
          created_at: string
          dataset_id: string
          external_ref: string | null
          features: number[]
          hospital_id: string
          id: string
          label: number
          split: string
        }
        Insert: {
          created_at?: string
          dataset_id: string
          external_ref?: string | null
          features: number[]
          hospital_id: string
          id?: string
          label: number
          split?: string
        }
        Update: {
          created_at?: string
          dataset_id?: string
          external_ref?: string | null
          features?: number[]
          hospital_id?: string
          id?: string
          label?: number
          split?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataset_samples_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_samples_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          created_at: string
          feature_names: Json
          hospital_id: string
          id: string
          name: string
          sample_count: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_names?: Json
          hospital_id: string
          id?: string
          name: string
          sample_count?: number
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_names?: Json
          hospital_id?: string
          id?: string
          name?: string
          sample_count?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "datasets_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      global_models: {
        Row: {
          bias: number
          created_at: string
          dp_clip_norm: number
          dp_noise_multiplier: number
          feature_means: number[]
          feature_names: Json
          feature_stds: number[]
          history: Json
          id: string
          is_active: boolean
          metrics: Json
          participating_hospitals: number
          rounds_completed: number
          secure_aggregation: boolean
          test_samples: number
          training_samples: number
          version: string
          weights: number[]
        }
        Insert: {
          bias?: number
          created_at?: string
          dp_clip_norm?: number
          dp_noise_multiplier?: number
          feature_means: number[]
          feature_names: Json
          feature_stds: number[]
          history?: Json
          id?: string
          is_active?: boolean
          metrics?: Json
          participating_hospitals?: number
          rounds_completed?: number
          secure_aggregation?: boolean
          test_samples?: number
          training_samples?: number
          version: string
          weights: number[]
        }
        Update: {
          bias?: number
          created_at?: string
          dp_clip_norm?: number
          dp_noise_multiplier?: number
          feature_means?: number[]
          feature_names?: Json
          feature_stds?: number[]
          history?: Json
          id?: string
          is_active?: boolean
          metrics?: Json
          participating_hospitals?: number
          rounds_completed?: number
          secure_aggregation?: boolean
          test_samples?: number
          training_samples?: number
          version?: string
          weights?: number[]
        }
        Relationships: []
      }
      hospitals: {
        Row: {
          created_at: string
          email: string
          id: string
          location: string
          name: string
          owner_id: string
          status: Database["public"]["Enums"]["hospital_status"]
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          location: string
          name: string
          owner_id: string
          status?: Database["public"]["Enums"]["hospital_status"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          location?: string
          name?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["hospital_status"]
        }
        Relationships: []
      }
      local_updates: {
        Row: {
          created_at: string
          hospital_id: string
          id: string
          local_accuracy: number | null
          local_loss: number | null
          masked: boolean
          round_id: string
          sample_count: number
          update_hash: string
        }
        Insert: {
          created_at?: string
          hospital_id: string
          id?: string
          local_accuracy?: number | null
          local_loss?: number | null
          masked?: boolean
          round_id: string
          sample_count: number
          update_hash: string
        }
        Update: {
          created_at?: string
          hospital_id?: string
          id?: string
          local_accuracy?: number | null
          local_loss?: number | null
          masked?: boolean
          round_id?: string
          sample_count?: number
          update_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_updates_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_updates_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "training_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          level: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          level?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          level?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          age: number
          created_at: string
          diagnosis: string | null
          disease_category: string
          gender: string
          hospital_id: string
          id: string
        }
        Insert: {
          age: number
          created_at?: string
          diagnosis?: string | null
          disease_category: string
          gender: string
          hospital_id: string
          id?: string
        }
        Update: {
          age?: number
          created_at?: string
          diagnosis?: string | null
          disease_category?: string
          gender?: string
          hospital_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string
          explanation_available: boolean
          hospital_id: string | null
          id: string
          input_features: Json | null
          model_version: string | null
          patient_id: string | null
          predicted_label: number | null
          probability: number | null
          recommended_action: string | null
          risk_level: string
          risk_percentage: number
          shap_explanation: Json
          status: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string
          explanation_available?: boolean
          hospital_id?: string | null
          id?: string
          input_features?: Json | null
          model_version?: string | null
          patient_id?: string | null
          predicted_label?: number | null
          probability?: number | null
          recommended_action?: string | null
          risk_level: string
          risk_percentage: number
          shap_explanation?: Json
          status?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string
          explanation_available?: boolean
          hospital_id?: string | null
          id?: string
          input_features?: Json | null
          model_version?: string | null
          patient_id?: string | null
          predicted_label?: number | null
          probability?: number | null
          recommended_action?: string | null
          risk_level?: string
          risk_percentage?: number
          shap_explanation?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      training_rounds: {
        Row: {
          created_at: string
          global_accuracy: number | null
          id: string
          metrics: Json
          model_id: string | null
          participating_hospitals: number
          round_number: number
          run_id: string
          weights_hash: string | null
        }
        Insert: {
          created_at?: string
          global_accuracy?: number | null
          id?: string
          metrics?: Json
          model_id?: string | null
          participating_hospitals?: number
          round_number: number
          run_id: string
          weights_hash?: string | null
        }
        Update: {
          created_at?: string
          global_accuracy?: number | null
          id?: string
          metrics?: Json
          model_id?: string | null
          participating_hospitals?: number
          round_number?: number
          run_id?: string
          weights_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_rounds_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "global_models"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_block_payload: {
        Args: {
          _actor_id: string
          _created_at: string
          _event_type: string
          _hospital_id: string
          _model_version: string
          _payload: Json
          _previous_hash: string
          _round_number: number
          _seq: number
        }
        Returns: string
      }
      current_hospital_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      verify_audit_chain: {
        Args: never
        Returns: {
          first_broken_seq: number
          total: number
          valid: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "hospital"
      hospital_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "hospital"],
      hospital_status: ["pending", "approved", "rejected"],
    },
  },
} as const
