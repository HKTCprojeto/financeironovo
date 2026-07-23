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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts_config: {
        Row: {
          active: boolean
          channels: Json
          condition: Json
          cooldown_min: number
          created_at: string
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channels?: Json
          condition?: Json
          cooldown_min?: number
          created_at?: string
          id?: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channels?: Json
          condition?: Json
          cooldown_min?: number
          created_at?: string
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      alerts_history: {
        Row: {
          alert_id: string | null
          id: number
          payload: Json | null
          resolved_at: string | null
          status: string
          triggered_at: string
        }
        Insert: {
          alert_id?: string | null
          id?: number
          payload?: Json | null
          resolved_at?: string | null
          status?: string
          triggered_at?: string
        }
        Update: {
          alert_id?: string | null
          id?: number
          payload?: Json | null
          resolved_at?: string | null
          status?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_history_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts_config"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: number
          payload: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: number
          payload?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: number
          payload?: Json
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_id: string | null
          confirmation_message_id: string | null
          confirmation_token: string | null
          error: string | null
          finished_at: string | null
          id: number
          result: Json | null
          started_at: string
          status: string
          steps: Json
          trigger_payload: Json | null
        }
        Insert: {
          automation_id?: string | null
          confirmation_message_id?: string | null
          confirmation_token?: string | null
          error?: string | null
          finished_at?: string | null
          id?: number
          result?: Json | null
          started_at?: string
          status: string
          steps?: Json
          trigger_payload?: Json | null
        }
        Update: {
          automation_id?: string | null
          confirmation_message_id?: string | null
          confirmation_token?: string | null
          error?: string | null
          finished_at?: string | null
          id?: number
          result?: Json | null
          started_at?: string
          status?: string
          steps?: Json
          trigger_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          active: boolean
          conditions: Json
          created_at: string
          description: string | null
          id: string
          last_run_at: string | null
          name: string
          next_run_at: string | null
          require_confirmation: boolean
          template_key: string | null
          trigger: Json
          updated_at: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          require_confirmation?: boolean
          template_key?: string | null
          trigger: Json
          updated_at?: string
        }
        Update: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          require_confirmation?: boolean
          template_key?: string | null
          trigger?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cfo_write_events: {
        Row: {
          action: string
          amount: number | null
          category: string | null
          channel: string
          confirmed_at: string | null
          created_at: string
          dedup_key: string | null
          due_date: string | null
          erp: string | null
          erp_record_id: string | null
          error: string | null
          id: string
          instance_id: string | null
          origin: string
          raw_text: string | null
          run_id: string | null
          status: string
          supplier: string | null
          thread_id: string
        }
        Insert: {
          action: string
          amount?: number | null
          category?: string | null
          channel: string
          confirmed_at?: string | null
          created_at?: string
          dedup_key?: string | null
          due_date?: string | null
          erp?: string | null
          erp_record_id?: string | null
          error?: string | null
          id?: string
          instance_id?: string | null
          origin?: string
          raw_text?: string | null
          run_id?: string | null
          status?: string
          supplier?: string | null
          thread_id: string
        }
        Update: {
          action?: string
          amount?: number | null
          category?: string | null
          channel?: string
          confirmed_at?: string | null
          created_at?: string
          dedup_key?: string | null
          due_date?: string | null
          erp?: string | null
          erp_record_id?: string | null
          error?: string | null
          id?: string
          instance_id?: string | null
          origin?: string
          raw_text?: string | null
          run_id?: string | null
          status?: string
          supplier?: string | null
          thread_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          channel: string
          content: string
          created_at: string | null
          id: number
          metadata: Json | null
          role: string
          status: string | null
          thread_id: string
        }
        Insert: {
          channel?: string
          content: string
          created_at?: string | null
          id?: number
          metadata?: Json | null
          role: string
          status?: string | null
          thread_id: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string | null
          id?: number
          metadata?: Json | null
          role?: string
          status?: string | null
          thread_id?: string
        }
        Relationships: []
      }
      dashboard_snapshots: {
        Row: {
          created_at: string
          data: Json
          expires_at: string
          id: number
        }
        Insert: {
          created_at?: string
          data: Json
          expires_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          data?: Json
          expires_at?: string
          id?: number
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          id: number
          instance_id: string
          payload: Json
          severity: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: number
          instance_id: string
          payload?: Json
          severity?: string
          type: string
        }
        Update: {
          created_at?: string
          id?: number
          instance_id?: string
          payload?: Json
          severity?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_config: {
        Row: {
          active: boolean
          api_key_encrypted: string
          base_url: string
          created_at: string
          id: string
          last_test_at: string | null
          last_test_detail: string | null
          last_test_status: string | null
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          active?: boolean
          api_key_encrypted: string
          base_url: string
          created_at?: string
          id?: string
          last_test_at?: string | null
          last_test_detail?: string | null
          last_test_status?: string | null
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          active?: boolean
          api_key_encrypted?: string
          base_url?: string
          created_at?: string
          id?: string
          last_test_at?: string | null
          last_test_detail?: string | null
          last_test_status?: string | null
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          active: boolean
          created_at: string
          id: string
          metric: string
          notes: string | null
          operator: string
          period: string
          target_value: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          metric: string
          notes?: string | null
          operator?: string
          period?: string
          target_value: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          metric?: string
          notes?: string | null
          operator?: string
          period?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      hooks_dedup: {
        Row: {
          channel: string
          created_at: string
          dedup_key: string
          expires_at: string
          external_id: string
          source: string
        }
        Insert: {
          channel: string
          created_at?: string
          dedup_key: string
          expires_at?: string
          external_id: string
          source?: string
        }
        Update: {
          channel?: string
          created_at?: string
          dedup_key?: string
          expires_at?: string
          external_id?: string
          source?: string
        }
        Relationships: []
      }
      installer_tokens: {
        Row: {
          created_at: string
          expires_at: string
          metadata: Json
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          metadata?: Json
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          metadata?: Json
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      instance_metrics: {
        Row: {
          id: number
          labels: Json
          metric_name: string
          metric_value: number
          recorded_at: string
        }
        Insert: {
          id?: number
          labels?: Json
          metric_name: string
          metric_value: number
          recorded_at?: string
        }
        Update: {
          id?: number
          labels?: Json
          metric_name?: string
          metric_value?: number
          recorded_at?: string
        }
        Relationships: []
      }
      instances: {
        Row: {
          agente_cfo_version: string | null
          connected_integrations: Json
          created_at: string
          hooks_token: string | null
          hostname: string | null
          id: string
          ingress_url: string | null
          last_heartbeat: string | null
          openclaw_dashboard_token: string | null
          openclaw_version: string | null
          status: string
          system_prompt: string | null
        }
        Insert: {
          agente_cfo_version?: string | null
          connected_integrations?: Json
          created_at?: string
          hooks_token?: string | null
          hostname?: string | null
          id?: string
          ingress_url?: string | null
          last_heartbeat?: string | null
          openclaw_dashboard_token?: string | null
          openclaw_version?: string | null
          status?: string
          system_prompt?: string | null
        }
        Update: {
          agente_cfo_version?: string | null
          connected_integrations?: Json
          created_at?: string
          hooks_token?: string | null
          hostname?: string | null
          id?: string
          ingress_url?: string | null
          last_heartbeat?: string | null
          openclaw_dashboard_token?: string | null
          openclaw_version?: string | null
          status?: string
          system_prompt?: string | null
        }
        Relationships: []
      }
      integration_credentials: {
        Row: {
          active: boolean
          created_at: string
          credentials_encrypted: string
          id: string
          last_test_at: string | null
          last_test_detail: string | null
          last_test_status: string | null
          skill_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          credentials_encrypted: string
          id?: string
          last_test_at?: string | null
          last_test_detail?: string | null
          last_test_status?: string | null
          skill_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          credentials_encrypted?: string
          id?: string
          last_test_at?: string | null
          last_test_detail?: string | null
          last_test_status?: string | null
          skill_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      llm_usage: {
        Row: {
          cost_brl: number
          created_at: string
          id: number
          input_tokens: number
          instance_id: string
          model: string
          output_tokens: number
          period: string
          session_id: string
        }
        Insert: {
          cost_brl?: number
          created_at?: string
          id?: number
          input_tokens?: number
          instance_id: string
          model?: string
          output_tokens?: number
          period: string
          session_id: string
        }
        Update: {
          cost_brl?: number
          created_at?: string
          id?: number
          input_tokens?: number
          instance_id?: string
          model?: string
          output_tokens?: number
          period?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      marcos_insights: {
        Row: {
          created_at: string
          data: Json
          expires_at: string
          id: number
          section: string
          severity: string
          text: string
        }
        Insert: {
          created_at?: string
          data?: Json
          expires_at?: string
          id?: number
          section: string
          severity?: string
          text: string
        }
        Update: {
          created_at?: string
          data?: Json
          expires_at?: string
          id?: number
          section?: string
          severity?: string
          text?: string
        }
        Relationships: []
      }
      omie_errors: {
        Row: {
          command: string | null
          created_at: string
          http_status: number | null
          id: number
          instance_id: string
          message: string | null
        }
        Insert: {
          command?: string | null
          created_at?: string
          http_status?: number | null
          id?: number
          instance_id: string
          message?: string | null
        }
        Update: {
          command?: string | null
          created_at?: string
          http_status?: number | null
          id?: number
          instance_id?: string
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "omie_errors_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_config: {
        Row: {
          created_at: string
          id: number
          panel_token: string
        }
        Insert: {
          created_at?: string
          id?: number
          panel_token: string
        }
        Update: {
          created_at?: string
          id?: number
          panel_token?: string
        }
        Relationships: []
      }
      report_issues_log: {
        Row: {
          created_at: string
          id: string
          issue_url: string | null
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_url?: string | null
          subject: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_url?: string | null
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          created_at: string
          id: string
          inputs: Json
          name: string
          result: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          inputs?: Json
          name: string
          result?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          inputs?: Json
          name?: string
          result?: Json | null
        }
        Relationships: []
      }
      supabase_projects: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          last_test_at: string | null
          last_test_status: string | null
          name: string
          project_url: string
          service_role_key_encrypted: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          last_test_at?: string | null
          last_test_status?: string | null
          name: string
          project_url: string
          service_role_key_encrypted: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          last_test_at?: string | null
          last_test_status?: string | null
          name?: string
          project_url?: string
          service_role_key_encrypted?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_bots: {
        Row: {
          active: boolean
          bot_name: string
          bot_token_encrypted: string
          bot_username: string
          created_at: string
          id: string
          last_test_at: string | null
          last_test_detail: string | null
          last_test_status: string | null
          receives_marcos_chat: boolean
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          active?: boolean
          bot_name: string
          bot_token_encrypted: string
          bot_username: string
          created_at?: string
          id?: string
          last_test_at?: string | null
          last_test_detail?: string | null
          last_test_status?: string | null
          receives_marcos_chat?: boolean
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          active?: boolean
          bot_name?: string
          bot_token_encrypted?: string
          bot_username?: string
          created_at?: string
          id?: string
          last_test_at?: string | null
          last_test_detail?: string | null
          last_test_status?: string | null
          receives_marcos_chat?: boolean
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      user_onboarding: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          instance_name: string
          last_seen: string | null
          metadata: Json | null
          phone_number: string | null
          qr_code_b64: string | null
          receives_marcos_chat: boolean
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          instance_name: string
          last_seen?: string | null
          metadata?: Json | null
          phone_number?: string | null
          qr_code_b64?: string | null
          receives_marcos_chat?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          instance_name?: string
          last_seen?: string | null
          metadata?: Json | null
          phone_number?: string | null
          qr_code_b64?: string | null
          receives_marcos_chat?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_status: {
        Row: {
          created_at: string
          id: number
          instance_id: string
          jid: string | null
          last_check: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: number
          instance_id: string
          jid?: string | null
          last_check?: string | null
          status: string
        }
        Update: {
          created_at?: string
          id?: number
          instance_id?: string
          jid?: string | null
          last_check?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_status_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
