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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_agents: {
        Row: {
          base_prompt: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          model_config_id: string | null
          name: string
        }
        Insert: {
          base_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          model_config_id?: string | null
          name: string
        }
        Update: {
          base_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          model_config_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_agents_model_config_id_fkey"
            columns: ["model_config_id"]
            isOneToOne: false
            referencedRelation: "llm_model_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_documents: {
        Row: {
          agent_id: string
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          storage_path: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          storage_path: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          storage_path?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "admin_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_documents_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          id: string
          last_login: string | null
          password_hash: string
          role: string
          status: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login?: string | null
          password_hash: string
          role?: string
          status?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login?: string | null
          password_hash?: string
          role?: string
          status?: string
          username?: string
        }
        Relationships: []
      }
      agent_feedback: {
        Row: {
          agent: string
          assistant_response: string
          created_at: string
          id: string
          intent: string | null
          message_index: number
          rating: number
          scope_level: string | null
          session_id: string
          user_question: string
        }
        Insert: {
          agent: string
          assistant_response: string
          created_at?: string
          id?: string
          intent?: string | null
          message_index: number
          rating: number
          scope_level?: string | null
          session_id: string
          user_question: string
        }
        Update: {
          agent?: string
          assistant_response?: string
          created_at?: string
          id?: string
          intent?: string | null
          message_index?: number
          rating?: number
          scope_level?: string | null
          session_id?: string
          user_question?: string
        }
        Relationships: []
      }
      agent_memory: {
        Row: {
          agent: string | null
          created_at: string
          id: string
          key: string
          memory_type: string
          relevance_score: number | null
          source_session_id: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          agent?: string | null
          created_at?: string
          id?: string
          key: string
          memory_type: string
          relevance_score?: number | null
          source_session_id?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          agent?: string | null
          created_at?: string
          id?: string
          key?: string
          memory_type?: string
          relevance_score?: number | null
          source_session_id?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      agent_modules: {
        Row: {
          agent_id: string
          module_id: string
        }
        Insert: {
          agent_id: string
          module_id: string
        }
        Update: {
          agent_id?: string
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_modules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "admin_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "admin_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          cost_estimate: number | null
          finished_at: string | null
          id: string
          latency_ms: number | null
          notes: string | null
          score: number | null
          started_at: string
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          agent_id: string
          cost_estimate?: number | null
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          notes?: string | null
          score?: number | null
          started_at?: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string
          cost_estimate?: number | null
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          notes?: string | null
          score?: number | null
          started_at?: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "admin_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skills: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          skill_type: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          skill_type?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          skill_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "admin_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          created_at: string
          dashboard_type: string
          description: string
          id: string
          is_archived: boolean
          is_shared: boolean
          name: string
          owner_username: string | null
          shared_with: string[] | null
          updated_at: string
          view_count: number
          visibility: string
          widgets: Json
        }
        Insert: {
          created_at?: string
          dashboard_type?: string
          description?: string
          id: string
          is_archived?: boolean
          is_shared?: boolean
          name: string
          owner_username?: string | null
          shared_with?: string[] | null
          updated_at?: string
          view_count?: number
          visibility?: string
          widgets?: Json
        }
        Update: {
          created_at?: string
          dashboard_type?: string
          description?: string
          id?: string
          is_archived?: boolean
          is_shared?: boolean
          name?: string
          owner_username?: string | null
          shared_with?: string[] | null
          updated_at?: string
          view_count?: number
          visibility?: string
          widgets?: Json
        }
        Relationships: []
      }
      investigators: {
        Row: {
          context: Json
          created_at: string
          id: string
          name: string
          updated_at: string
          visibility: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      kpi_catalog: {
        Row: {
          color: string | null
          created_at: string | null
          default_agg: string | null
          definition: string | null
          denominator: string | null
          display_name: string
          famille: string | null
          formula_sql: string | null
          id: number
          is_map_supported: boolean | null
          kpi_key: string
          nom_bdd: string | null
          numerator: string | null
          orientation: string | null
          priorite: string | null
          techno: string | null
          threshold_critical: number | null
          threshold_warning: number | null
          unit: string | null
          value_type: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          default_agg?: string | null
          definition?: string | null
          denominator?: string | null
          display_name: string
          famille?: string | null
          formula_sql?: string | null
          id?: never
          is_map_supported?: boolean | null
          kpi_key: string
          nom_bdd?: string | null
          numerator?: string | null
          orientation?: string | null
          priorite?: string | null
          techno?: string | null
          threshold_critical?: number | null
          threshold_warning?: number | null
          unit?: string | null
          value_type?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          default_agg?: string | null
          definition?: string | null
          denominator?: string | null
          display_name?: string
          famille?: string | null
          formula_sql?: string | null
          id?: never
          is_map_supported?: boolean | null
          kpi_key?: string
          nom_bdd?: string | null
          numerator?: string | null
          orientation?: string | null
          priorite?: string | null
          techno?: string | null
          threshold_critical?: number | null
          threshold_warning?: number | null
          unit?: string | null
          value_type?: string | null
        }
        Relationships: []
      }
      kpi_qoe_aggregated: {
        Row: {
          "5G_capable_rate": number | null
          "5gue_attached_4G_rate": number | null
          created_at: string | null
          date_part: string
          debit_dl: number | null
          debit_dl_max: number | null
          debit_dl_vol10: number | null
          debit_dl_vol5: number | null
          debit_ul: number | null
          debit_ul_max: number | null
          debit_ul_vol10: number | null
          debit_ul_vol5: number | null
          dimension_1: string
          dimension_2: string
          dms_3_dl_vol10: number | null
          dms_3_dl_vol5: number | null
          dms_30_dl_vol10: number | null
          dms_30_dl_vol5: number | null
          dms_8_dl_vol10: number | null
          dms_8_dl_vol5: number | null
          dms_debit_dl_3: number | null
          dms_debit_dl_30: number | null
          dms_debit_dl_8: number | null
          dms_debit_ul_1: number | null
          dms_debit_ul_3: number | null
          dms_debit_ul_5: number | null
          fallback_4G_to_3G2G_rate: number | null
          fallback_5G_to_4G_rate: number | null
          id: number
          instability_rate: number | null
          "loss_dl_0_0.01": number | null
          "loss_dl_0.01_0.03": number | null
          "loss_dl_0.03_0.05": number | null
          "loss_dl_0.05_inf": number | null
          loss_dl_rate: number | null
          "loss_ul_0_0.01": number | null
          "loss_ul_0.01_0.03": number | null
          "loss_ul_0.03_0.05": number | null
          "loss_ul_0.05_inf": number | null
          loss_ul_rate: number | null
          Mauvaise_Session_nbr: number | null
          Mauvaise_Session_Rate: number | null
          out_of_order_nbr: number | null
          out_of_order_rate: number | null
          qoe_index: number | null
          "retr_dl_0_0.01": number | null
          "retr_dl_0.01_0.03": number | null
          "retr_dl_0.03_0.05": number | null
          "retr_dl_0.05_inf": number | null
          "retr_ul_0_0.01": number | null
          "retr_ul_0.01_0.03": number | null
          "retr_ul_0.03_0.05": number | null
          "retr_ul_0.05_inf": number | null
          rtt_data_0_40000: number | null
          rtt_data_150000_300000: number | null
          rtt_data_300000_inf: number | null
          rtt_data_40000_80000: number | null
          rtt_data_80000_150000: number | null
          rtt_data_avg: number | null
          rtt_setup_0_40000: number | null
          rtt_setup_150000_300000: number | null
          rtt_setup_300000_inf: number | null
          rtt_setup_40000_80000: number | null
          rtt_setup_80000_150000: number | null
          rtt_setup_avg: number | null
          session_3g2g_nbr: number | null
          session_4g_nbr: number | null
          session_5g_nbr: number | null
          session_dcr: number | null
          session_dur_moy: number | null
          session_nbr: number | null
          session_wifi_nbr: number | null
          tcp_retr_rate_dl: number | null
          tcp_retr_rate_ul: number | null
          time_rat_3g2g_pct: number | null
          time_rat_4g_pct: number | null
          time_rat_5g_pct: number | null
          time_rat_wifi_pct: number | null
          volume_totale_dl: number | null
          volume_totale_totale: number | null
          volume_totale_ul: number | null
          wind_full_nbr: number | null
          wind_full_rate: number | null
        }
        Insert: {
          "5G_capable_rate"?: number | null
          "5gue_attached_4G_rate"?: number | null
          created_at?: string | null
          date_part: string
          debit_dl?: number | null
          debit_dl_max?: number | null
          debit_dl_vol10?: number | null
          debit_dl_vol5?: number | null
          debit_ul?: number | null
          debit_ul_max?: number | null
          debit_ul_vol10?: number | null
          debit_ul_vol5?: number | null
          dimension_1: string
          dimension_2: string
          dms_3_dl_vol10?: number | null
          dms_3_dl_vol5?: number | null
          dms_30_dl_vol10?: number | null
          dms_30_dl_vol5?: number | null
          dms_8_dl_vol10?: number | null
          dms_8_dl_vol5?: number | null
          dms_debit_dl_3?: number | null
          dms_debit_dl_30?: number | null
          dms_debit_dl_8?: number | null
          dms_debit_ul_1?: number | null
          dms_debit_ul_3?: number | null
          dms_debit_ul_5?: number | null
          fallback_4G_to_3G2G_rate?: number | null
          fallback_5G_to_4G_rate?: number | null
          id?: number
          instability_rate?: number | null
          "loss_dl_0_0.01"?: number | null
          "loss_dl_0.01_0.03"?: number | null
          "loss_dl_0.03_0.05"?: number | null
          "loss_dl_0.05_inf"?: number | null
          loss_dl_rate?: number | null
          "loss_ul_0_0.01"?: number | null
          "loss_ul_0.01_0.03"?: number | null
          "loss_ul_0.03_0.05"?: number | null
          "loss_ul_0.05_inf"?: number | null
          loss_ul_rate?: number | null
          Mauvaise_Session_nbr?: number | null
          Mauvaise_Session_Rate?: number | null
          out_of_order_nbr?: number | null
          out_of_order_rate?: number | null
          qoe_index?: number | null
          "retr_dl_0_0.01"?: number | null
          "retr_dl_0.01_0.03"?: number | null
          "retr_dl_0.03_0.05"?: number | null
          "retr_dl_0.05_inf"?: number | null
          "retr_ul_0_0.01"?: number | null
          "retr_ul_0.01_0.03"?: number | null
          "retr_ul_0.03_0.05"?: number | null
          "retr_ul_0.05_inf"?: number | null
          rtt_data_0_40000?: number | null
          rtt_data_150000_300000?: number | null
          rtt_data_300000_inf?: number | null
          rtt_data_40000_80000?: number | null
          rtt_data_80000_150000?: number | null
          rtt_data_avg?: number | null
          rtt_setup_0_40000?: number | null
          rtt_setup_150000_300000?: number | null
          rtt_setup_300000_inf?: number | null
          rtt_setup_40000_80000?: number | null
          rtt_setup_80000_150000?: number | null
          rtt_setup_avg?: number | null
          session_3g2g_nbr?: number | null
          session_4g_nbr?: number | null
          session_5g_nbr?: number | null
          session_dcr?: number | null
          session_dur_moy?: number | null
          session_nbr?: number | null
          session_wifi_nbr?: number | null
          tcp_retr_rate_dl?: number | null
          tcp_retr_rate_ul?: number | null
          time_rat_3g2g_pct?: number | null
          time_rat_4g_pct?: number | null
          time_rat_5g_pct?: number | null
          time_rat_wifi_pct?: number | null
          volume_totale_dl?: number | null
          volume_totale_totale?: number | null
          volume_totale_ul?: number | null
          wind_full_nbr?: number | null
          wind_full_rate?: number | null
        }
        Update: {
          "5G_capable_rate"?: number | null
          "5gue_attached_4G_rate"?: number | null
          created_at?: string | null
          date_part?: string
          debit_dl?: number | null
          debit_dl_max?: number | null
          debit_dl_vol10?: number | null
          debit_dl_vol5?: number | null
          debit_ul?: number | null
          debit_ul_max?: number | null
          debit_ul_vol10?: number | null
          debit_ul_vol5?: number | null
          dimension_1?: string
          dimension_2?: string
          dms_3_dl_vol10?: number | null
          dms_3_dl_vol5?: number | null
          dms_30_dl_vol10?: number | null
          dms_30_dl_vol5?: number | null
          dms_8_dl_vol10?: number | null
          dms_8_dl_vol5?: number | null
          dms_debit_dl_3?: number | null
          dms_debit_dl_30?: number | null
          dms_debit_dl_8?: number | null
          dms_debit_ul_1?: number | null
          dms_debit_ul_3?: number | null
          dms_debit_ul_5?: number | null
          fallback_4G_to_3G2G_rate?: number | null
          fallback_5G_to_4G_rate?: number | null
          id?: number
          instability_rate?: number | null
          "loss_dl_0_0.01"?: number | null
          "loss_dl_0.01_0.03"?: number | null
          "loss_dl_0.03_0.05"?: number | null
          "loss_dl_0.05_inf"?: number | null
          loss_dl_rate?: number | null
          "loss_ul_0_0.01"?: number | null
          "loss_ul_0.01_0.03"?: number | null
          "loss_ul_0.03_0.05"?: number | null
          "loss_ul_0.05_inf"?: number | null
          loss_ul_rate?: number | null
          Mauvaise_Session_nbr?: number | null
          Mauvaise_Session_Rate?: number | null
          out_of_order_nbr?: number | null
          out_of_order_rate?: number | null
          qoe_index?: number | null
          "retr_dl_0_0.01"?: number | null
          "retr_dl_0.01_0.03"?: number | null
          "retr_dl_0.03_0.05"?: number | null
          "retr_dl_0.05_inf"?: number | null
          "retr_ul_0_0.01"?: number | null
          "retr_ul_0.01_0.03"?: number | null
          "retr_ul_0.03_0.05"?: number | null
          "retr_ul_0.05_inf"?: number | null
          rtt_data_0_40000?: number | null
          rtt_data_150000_300000?: number | null
          rtt_data_300000_inf?: number | null
          rtt_data_40000_80000?: number | null
          rtt_data_80000_150000?: number | null
          rtt_data_avg?: number | null
          rtt_setup_0_40000?: number | null
          rtt_setup_150000_300000?: number | null
          rtt_setup_300000_inf?: number | null
          rtt_setup_40000_80000?: number | null
          rtt_setup_80000_150000?: number | null
          rtt_setup_avg?: number | null
          session_3g2g_nbr?: number | null
          session_4g_nbr?: number | null
          session_5g_nbr?: number | null
          session_dcr?: number | null
          session_dur_moy?: number | null
          session_nbr?: number | null
          session_wifi_nbr?: number | null
          tcp_retr_rate_dl?: number | null
          tcp_retr_rate_ul?: number | null
          time_rat_3g2g_pct?: number | null
          time_rat_4g_pct?: number | null
          time_rat_5g_pct?: number | null
          time_rat_wifi_pct?: number | null
          volume_totale_dl?: number | null
          volume_totale_totale?: number | null
          volume_totale_ul?: number | null
          wind_full_nbr?: number | null
          wind_full_rate?: number | null
        }
        Relationships: []
      }
      llm_model_configs: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          max_tokens: number
          model_name: string
          provider: string
          system_prompt_prefix: string | null
          temperature: number
          top_p: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          max_tokens?: number
          model_name?: string
          provider?: string
          system_prompt_prefix?: string | null
          temperature?: number
          top_p?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          max_tokens?: number
          model_name?: string
          provider?: string
          system_prompt_prefix?: string | null
          temperature?: number
          top_p?: number
          updated_at?: string
        }
        Relationships: []
      }
      map_views: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      memory_items: {
        Row: {
          agent_id: string | null
          content: string
          created_at: string
          id: string
          importance: number
          tags: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          content: string
          created_at?: string
          id?: string
          importance?: number
          tags?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          content?: string
          created_at?: string
          id?: string
          importance?: number
          tags?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_items_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "admin_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_features: {
        Row: {
          "5G_capable_rate": number | null
          "5gue_attached_4G_rate": number | null
          created_at: string | null
          date_part: string
          debit_dl: number | null
          debit_dl_delta14j_pct: number | null
          debit_dl_delta7j_pct: number | null
          "debit_dl_J-14": number | null
          "debit_dl_J-7": number | null
          debit_dl_max: number | null
          debit_dl_vol10: number | null
          debit_dl_vol5: number | null
          debit_ul: number | null
          debit_ul_delta14j_pct: number | null
          debit_ul_delta7j_pct: number | null
          "debit_ul_J-14": number | null
          "debit_ul_J-7": number | null
          debit_ul_max: number | null
          debit_ul_vol10: number | null
          debit_ul_vol5: number | null
          dimension_1: string
          dimension_2: string
          dms_3_dl_vol10: number | null
          dms_3_dl_vol5: number | null
          dms_30_dl_vol10: number | null
          dms_30_dl_vol5: number | null
          dms_8_dl_vol10: number | null
          dms_8_dl_vol5: number | null
          dms_debit_dl_3: number | null
          dms_debit_dl_3_delta14j_pct: number | null
          dms_debit_dl_3_delta7j_pct: number | null
          "dms_debit_dl_3_J-14": number | null
          "dms_debit_dl_3_J-7": number | null
          dms_debit_dl_30: number | null
          dms_debit_dl_30_delta14j_pct: number | null
          dms_debit_dl_30_delta7j_pct: number | null
          "dms_debit_dl_30_J-14": number | null
          "dms_debit_dl_30_J-7": number | null
          dms_debit_dl_8: number | null
          dms_debit_dl_8_delta14j_pct: number | null
          dms_debit_dl_8_delta7j_pct: number | null
          "dms_debit_dl_8_J-14": number | null
          "dms_debit_dl_8_J-7": number | null
          dms_debit_ul_1: number | null
          dms_debit_ul_1_delta14j_pct: number | null
          dms_debit_ul_1_delta7j_pct: number | null
          "dms_debit_ul_1_J-14": number | null
          "dms_debit_ul_1_J-7": number | null
          dms_debit_ul_3: number | null
          dms_debit_ul_3_delta14j_pct: number | null
          dms_debit_ul_3_delta7j_pct: number | null
          "dms_debit_ul_3_J-14": number | null
          "dms_debit_ul_3_J-7": number | null
          dms_debit_ul_5: number | null
          dms_debit_ul_5_delta14j_pct: number | null
          dms_debit_ul_5_delta7j_pct: number | null
          "dms_debit_ul_5_J-14": number | null
          "dms_debit_ul_5_J-7": number | null
          fallback_4G_to_3G2G_rate: number | null
          fallback_5G_to_4G_rate: number | null
          fallback_5G_to_4G_rate_delta14j_pct: number | null
          fallback_5G_to_4G_rate_delta7j_pct: number | null
          "fallback_5G_to_4G_rate_J-14": number | null
          "fallback_5G_to_4G_rate_J-7": number | null
          id: number
          instability_rate: number | null
          instability_rate_delta14j_pct: number | null
          instability_rate_delta7j_pct: number | null
          "instability_rate_J-14": number | null
          "instability_rate_J-7": number | null
          "loss_dl_0_0.01": number | null
          "loss_dl_0.01_0.03": number | null
          "loss_dl_0.03_0.05": number | null
          "loss_dl_0.05_inf": number | null
          loss_dl_rate: number | null
          loss_dl_rate_delta14j_pct: number | null
          loss_dl_rate_delta7j_pct: number | null
          "loss_dl_rate_J-14": number | null
          "loss_dl_rate_J-7": number | null
          "loss_ul_0_0.01": number | null
          "loss_ul_0.01_0.03": number | null
          "loss_ul_0.03_0.05": number | null
          "loss_ul_0.05_inf": number | null
          loss_ul_rate: number | null
          loss_ul_rate_delta14j_pct: number | null
          loss_ul_rate_delta7j_pct: number | null
          "loss_ul_rate_J-14": number | null
          "loss_ul_rate_J-7": number | null
          Mauvaise_Session_nbr: number | null
          Mauvaise_Session_Rate: number | null
          Mauvaise_Session_Rate_delta14j_pct: number | null
          Mauvaise_Session_Rate_delta7j_pct: number | null
          "Mauvaise_Session_Rate_J-14": number | null
          "Mauvaise_Session_Rate_J-7": number | null
          out_of_order_nbr: number | null
          out_of_order_rate: number | null
          out_of_order_rate_delta14j_pct: number | null
          out_of_order_rate_delta7j_pct: number | null
          "out_of_order_rate_J-14": number | null
          "out_of_order_rate_J-7": number | null
          pct_debit_dl: number | null
          pct_debit_ul: number | null
          pct_dms_debit_dl_3: number | null
          pct_dms_debit_dl_30: number | null
          pct_dms_debit_dl_8: number | null
          pct_dms_debit_ul_1: number | null
          pct_dms_debit_ul_3: number | null
          pct_dms_debit_ul_5: number | null
          pct_fallback_5G_to_4G_rate: number | null
          pct_instability_rate: number | null
          pct_loss_dl_rate: number | null
          pct_loss_ul_rate: number | null
          pct_Mauvaise_Session_Rate: number | null
          pct_out_of_order_rate: number | null
          pct_qoe_index: number | null
          pct_rtt_data_avg: number | null
          pct_rtt_setup_avg: number | null
          pct_session_dcr: number | null
          pct_session_dur_moy: number | null
          pct_session_nbr: number | null
          pct_tcp_retr_rate_dl: number | null
          pct_tcp_retr_rate_ul: number | null
          pct_time_rat_4g_pct: number | null
          pct_time_rat_5g_pct: number | null
          pct_volume_totale_dl: number | null
          pct_volume_totale_ul: number | null
          pct_wind_full_rate: number | null
          qoe_composite: number | null
          qoe_index: number | null
          qoe_index_delta14j_pct: number | null
          qoe_index_delta7j_pct: number | null
          "qoe_index_J-14": number | null
          "qoe_index_J-7": number | null
          "retr_dl_0_0.01": number | null
          "retr_dl_0.01_0.03": number | null
          "retr_dl_0.03_0.05": number | null
          "retr_dl_0.05_inf": number | null
          "retr_ul_0_0.01": number | null
          "retr_ul_0.01_0.03": number | null
          "retr_ul_0.03_0.05": number | null
          "retr_ul_0.05_inf": number | null
          rtt_data_0_40000: number | null
          rtt_data_150000_300000: number | null
          rtt_data_300000_inf: number | null
          rtt_data_40000_80000: number | null
          rtt_data_80000_150000: number | null
          rtt_data_avg: number | null
          rtt_data_avg_delta14j_pct: number | null
          rtt_data_avg_delta7j_pct: number | null
          "rtt_data_avg_J-14": number | null
          "rtt_data_avg_J-7": number | null
          rtt_setup_0_40000: number | null
          rtt_setup_150000_300000: number | null
          rtt_setup_300000_inf: number | null
          rtt_setup_40000_80000: number | null
          rtt_setup_80000_150000: number | null
          rtt_setup_avg: number | null
          rtt_setup_avg_delta14j_pct: number | null
          rtt_setup_avg_delta7j_pct: number | null
          "rtt_setup_avg_J-14": number | null
          "rtt_setup_avg_J-7": number | null
          score_debit: number | null
          score_dms: number | null
          score_drop: number | null
          score_latence: number | null
          score_loss: number | null
          score_retr: number | null
          score_stabilite: number | null
          session_3g2g_nbr: number | null
          session_4g_nbr: number | null
          session_5g_nbr: number | null
          session_dcr: number | null
          session_dcr_delta14j_pct: number | null
          session_dcr_delta7j_pct: number | null
          "session_dcr_J-14": number | null
          "session_dcr_J-7": number | null
          session_dur_moy: number | null
          session_dur_moy_delta14j_pct: number | null
          session_dur_moy_delta7j_pct: number | null
          "session_dur_moy_J-14": number | null
          "session_dur_moy_J-7": number | null
          session_nbr: number | null
          session_nbr_delta14j_pct: number | null
          session_nbr_delta7j_pct: number | null
          "session_nbr_J-14": number | null
          "session_nbr_J-7": number | null
          session_wifi_nbr: number | null
          tcp_retr_rate_dl: number | null
          tcp_retr_rate_dl_delta14j_pct: number | null
          tcp_retr_rate_dl_delta7j_pct: number | null
          "tcp_retr_rate_dl_J-14": number | null
          "tcp_retr_rate_dl_J-7": number | null
          tcp_retr_rate_ul: number | null
          tcp_retr_rate_ul_delta14j_pct: number | null
          tcp_retr_rate_ul_delta7j_pct: number | null
          "tcp_retr_rate_ul_J-14": number | null
          "tcp_retr_rate_ul_J-7": number | null
          time_rat_3g2g_pct: number | null
          time_rat_4g_pct: number | null
          time_rat_4g_pct_delta14j_pct: number | null
          time_rat_4g_pct_delta7j_pct: number | null
          "time_rat_4g_pct_J-14": number | null
          "time_rat_4g_pct_J-7": number | null
          time_rat_5g_pct: number | null
          time_rat_5g_pct_delta14j_pct: number | null
          time_rat_5g_pct_delta7j_pct: number | null
          "time_rat_5g_pct_J-14": number | null
          "time_rat_5g_pct_J-7": number | null
          time_rat_wifi_pct: number | null
          trend_debit_dl: string | null
          trend_qoe: string | null
          trend_rtt: string | null
          volume_totale_dl: number | null
          volume_totale_dl_delta14j_pct: number | null
          volume_totale_dl_delta7j_pct: number | null
          "volume_totale_dl_J-14": number | null
          "volume_totale_dl_J-7": number | null
          volume_totale_totale: number | null
          volume_totale_ul: number | null
          volume_totale_ul_delta14j_pct: number | null
          volume_totale_ul_delta7j_pct: number | null
          "volume_totale_ul_J-14": number | null
          "volume_totale_ul_J-7": number | null
          wind_full_nbr: number | null
          wind_full_rate: number | null
          wind_full_rate_delta14j_pct: number | null
          wind_full_rate_delta7j_pct: number | null
          "wind_full_rate_J-14": number | null
          "wind_full_rate_J-7": number | null
          z_debit_dl: number | null
          z_debit_ul: number | null
          z_dms_debit_dl_3: number | null
          z_dms_debit_dl_30: number | null
          z_dms_debit_dl_8: number | null
          z_dms_debit_ul_1: number | null
          z_dms_debit_ul_3: number | null
          z_dms_debit_ul_5: number | null
          z_fallback_5G_to_4G_rate: number | null
          z_instability_rate: number | null
          z_loss_dl_rate: number | null
          z_loss_ul_rate: number | null
          z_Mauvaise_Session_Rate: number | null
          z_out_of_order_rate: number | null
          z_qoe_index: number | null
          z_rtt_data_avg: number | null
          z_rtt_setup_avg: number | null
          z_session_dcr: number | null
          z_session_dur_moy: number | null
          z_session_nbr: number | null
          z_tcp_retr_rate_dl: number | null
          z_tcp_retr_rate_ul: number | null
          z_time_rat_4g_pct: number | null
          z_time_rat_5g_pct: number | null
          z_volume_totale_dl: number | null
          z_volume_totale_ul: number | null
          z_wind_full_rate: number | null
        }
        Insert: {
          "5G_capable_rate"?: number | null
          "5gue_attached_4G_rate"?: number | null
          created_at?: string | null
          date_part: string
          debit_dl?: number | null
          debit_dl_delta14j_pct?: number | null
          debit_dl_delta7j_pct?: number | null
          "debit_dl_J-14"?: number | null
          "debit_dl_J-7"?: number | null
          debit_dl_max?: number | null
          debit_dl_vol10?: number | null
          debit_dl_vol5?: number | null
          debit_ul?: number | null
          debit_ul_delta14j_pct?: number | null
          debit_ul_delta7j_pct?: number | null
          "debit_ul_J-14"?: number | null
          "debit_ul_J-7"?: number | null
          debit_ul_max?: number | null
          debit_ul_vol10?: number | null
          debit_ul_vol5?: number | null
          dimension_1: string
          dimension_2: string
          dms_3_dl_vol10?: number | null
          dms_3_dl_vol5?: number | null
          dms_30_dl_vol10?: number | null
          dms_30_dl_vol5?: number | null
          dms_8_dl_vol10?: number | null
          dms_8_dl_vol5?: number | null
          dms_debit_dl_3?: number | null
          dms_debit_dl_3_delta14j_pct?: number | null
          dms_debit_dl_3_delta7j_pct?: number | null
          "dms_debit_dl_3_J-14"?: number | null
          "dms_debit_dl_3_J-7"?: number | null
          dms_debit_dl_30?: number | null
          dms_debit_dl_30_delta14j_pct?: number | null
          dms_debit_dl_30_delta7j_pct?: number | null
          "dms_debit_dl_30_J-14"?: number | null
          "dms_debit_dl_30_J-7"?: number | null
          dms_debit_dl_8?: number | null
          dms_debit_dl_8_delta14j_pct?: number | null
          dms_debit_dl_8_delta7j_pct?: number | null
          "dms_debit_dl_8_J-14"?: number | null
          "dms_debit_dl_8_J-7"?: number | null
          dms_debit_ul_1?: number | null
          dms_debit_ul_1_delta14j_pct?: number | null
          dms_debit_ul_1_delta7j_pct?: number | null
          "dms_debit_ul_1_J-14"?: number | null
          "dms_debit_ul_1_J-7"?: number | null
          dms_debit_ul_3?: number | null
          dms_debit_ul_3_delta14j_pct?: number | null
          dms_debit_ul_3_delta7j_pct?: number | null
          "dms_debit_ul_3_J-14"?: number | null
          "dms_debit_ul_3_J-7"?: number | null
          dms_debit_ul_5?: number | null
          dms_debit_ul_5_delta14j_pct?: number | null
          dms_debit_ul_5_delta7j_pct?: number | null
          "dms_debit_ul_5_J-14"?: number | null
          "dms_debit_ul_5_J-7"?: number | null
          fallback_4G_to_3G2G_rate?: number | null
          fallback_5G_to_4G_rate?: number | null
          fallback_5G_to_4G_rate_delta14j_pct?: number | null
          fallback_5G_to_4G_rate_delta7j_pct?: number | null
          "fallback_5G_to_4G_rate_J-14"?: number | null
          "fallback_5G_to_4G_rate_J-7"?: number | null
          id?: number
          instability_rate?: number | null
          instability_rate_delta14j_pct?: number | null
          instability_rate_delta7j_pct?: number | null
          "instability_rate_J-14"?: number | null
          "instability_rate_J-7"?: number | null
          "loss_dl_0_0.01"?: number | null
          "loss_dl_0.01_0.03"?: number | null
          "loss_dl_0.03_0.05"?: number | null
          "loss_dl_0.05_inf"?: number | null
          loss_dl_rate?: number | null
          loss_dl_rate_delta14j_pct?: number | null
          loss_dl_rate_delta7j_pct?: number | null
          "loss_dl_rate_J-14"?: number | null
          "loss_dl_rate_J-7"?: number | null
          "loss_ul_0_0.01"?: number | null
          "loss_ul_0.01_0.03"?: number | null
          "loss_ul_0.03_0.05"?: number | null
          "loss_ul_0.05_inf"?: number | null
          loss_ul_rate?: number | null
          loss_ul_rate_delta14j_pct?: number | null
          loss_ul_rate_delta7j_pct?: number | null
          "loss_ul_rate_J-14"?: number | null
          "loss_ul_rate_J-7"?: number | null
          Mauvaise_Session_nbr?: number | null
          Mauvaise_Session_Rate?: number | null
          Mauvaise_Session_Rate_delta14j_pct?: number | null
          Mauvaise_Session_Rate_delta7j_pct?: number | null
          "Mauvaise_Session_Rate_J-14"?: number | null
          "Mauvaise_Session_Rate_J-7"?: number | null
          out_of_order_nbr?: number | null
          out_of_order_rate?: number | null
          out_of_order_rate_delta14j_pct?: number | null
          out_of_order_rate_delta7j_pct?: number | null
          "out_of_order_rate_J-14"?: number | null
          "out_of_order_rate_J-7"?: number | null
          pct_debit_dl?: number | null
          pct_debit_ul?: number | null
          pct_dms_debit_dl_3?: number | null
          pct_dms_debit_dl_30?: number | null
          pct_dms_debit_dl_8?: number | null
          pct_dms_debit_ul_1?: number | null
          pct_dms_debit_ul_3?: number | null
          pct_dms_debit_ul_5?: number | null
          pct_fallback_5G_to_4G_rate?: number | null
          pct_instability_rate?: number | null
          pct_loss_dl_rate?: number | null
          pct_loss_ul_rate?: number | null
          pct_Mauvaise_Session_Rate?: number | null
          pct_out_of_order_rate?: number | null
          pct_qoe_index?: number | null
          pct_rtt_data_avg?: number | null
          pct_rtt_setup_avg?: number | null
          pct_session_dcr?: number | null
          pct_session_dur_moy?: number | null
          pct_session_nbr?: number | null
          pct_tcp_retr_rate_dl?: number | null
          pct_tcp_retr_rate_ul?: number | null
          pct_time_rat_4g_pct?: number | null
          pct_time_rat_5g_pct?: number | null
          pct_volume_totale_dl?: number | null
          pct_volume_totale_ul?: number | null
          pct_wind_full_rate?: number | null
          qoe_composite?: number | null
          qoe_index?: number | null
          qoe_index_delta14j_pct?: number | null
          qoe_index_delta7j_pct?: number | null
          "qoe_index_J-14"?: number | null
          "qoe_index_J-7"?: number | null
          "retr_dl_0_0.01"?: number | null
          "retr_dl_0.01_0.03"?: number | null
          "retr_dl_0.03_0.05"?: number | null
          "retr_dl_0.05_inf"?: number | null
          "retr_ul_0_0.01"?: number | null
          "retr_ul_0.01_0.03"?: number | null
          "retr_ul_0.03_0.05"?: number | null
          "retr_ul_0.05_inf"?: number | null
          rtt_data_0_40000?: number | null
          rtt_data_150000_300000?: number | null
          rtt_data_300000_inf?: number | null
          rtt_data_40000_80000?: number | null
          rtt_data_80000_150000?: number | null
          rtt_data_avg?: number | null
          rtt_data_avg_delta14j_pct?: number | null
          rtt_data_avg_delta7j_pct?: number | null
          "rtt_data_avg_J-14"?: number | null
          "rtt_data_avg_J-7"?: number | null
          rtt_setup_0_40000?: number | null
          rtt_setup_150000_300000?: number | null
          rtt_setup_300000_inf?: number | null
          rtt_setup_40000_80000?: number | null
          rtt_setup_80000_150000?: number | null
          rtt_setup_avg?: number | null
          rtt_setup_avg_delta14j_pct?: number | null
          rtt_setup_avg_delta7j_pct?: number | null
          "rtt_setup_avg_J-14"?: number | null
          "rtt_setup_avg_J-7"?: number | null
          score_debit?: number | null
          score_dms?: number | null
          score_drop?: number | null
          score_latence?: number | null
          score_loss?: number | null
          score_retr?: number | null
          score_stabilite?: number | null
          session_3g2g_nbr?: number | null
          session_4g_nbr?: number | null
          session_5g_nbr?: number | null
          session_dcr?: number | null
          session_dcr_delta14j_pct?: number | null
          session_dcr_delta7j_pct?: number | null
          "session_dcr_J-14"?: number | null
          "session_dcr_J-7"?: number | null
          session_dur_moy?: number | null
          session_dur_moy_delta14j_pct?: number | null
          session_dur_moy_delta7j_pct?: number | null
          "session_dur_moy_J-14"?: number | null
          "session_dur_moy_J-7"?: number | null
          session_nbr?: number | null
          session_nbr_delta14j_pct?: number | null
          session_nbr_delta7j_pct?: number | null
          "session_nbr_J-14"?: number | null
          "session_nbr_J-7"?: number | null
          session_wifi_nbr?: number | null
          tcp_retr_rate_dl?: number | null
          tcp_retr_rate_dl_delta14j_pct?: number | null
          tcp_retr_rate_dl_delta7j_pct?: number | null
          "tcp_retr_rate_dl_J-14"?: number | null
          "tcp_retr_rate_dl_J-7"?: number | null
          tcp_retr_rate_ul?: number | null
          tcp_retr_rate_ul_delta14j_pct?: number | null
          tcp_retr_rate_ul_delta7j_pct?: number | null
          "tcp_retr_rate_ul_J-14"?: number | null
          "tcp_retr_rate_ul_J-7"?: number | null
          time_rat_3g2g_pct?: number | null
          time_rat_4g_pct?: number | null
          time_rat_4g_pct_delta14j_pct?: number | null
          time_rat_4g_pct_delta7j_pct?: number | null
          "time_rat_4g_pct_J-14"?: number | null
          "time_rat_4g_pct_J-7"?: number | null
          time_rat_5g_pct?: number | null
          time_rat_5g_pct_delta14j_pct?: number | null
          time_rat_5g_pct_delta7j_pct?: number | null
          "time_rat_5g_pct_J-14"?: number | null
          "time_rat_5g_pct_J-7"?: number | null
          time_rat_wifi_pct?: number | null
          trend_debit_dl?: string | null
          trend_qoe?: string | null
          trend_rtt?: string | null
          volume_totale_dl?: number | null
          volume_totale_dl_delta14j_pct?: number | null
          volume_totale_dl_delta7j_pct?: number | null
          "volume_totale_dl_J-14"?: number | null
          "volume_totale_dl_J-7"?: number | null
          volume_totale_totale?: number | null
          volume_totale_ul?: number | null
          volume_totale_ul_delta14j_pct?: number | null
          volume_totale_ul_delta7j_pct?: number | null
          "volume_totale_ul_J-14"?: number | null
          "volume_totale_ul_J-7"?: number | null
          wind_full_nbr?: number | null
          wind_full_rate?: number | null
          wind_full_rate_delta14j_pct?: number | null
          wind_full_rate_delta7j_pct?: number | null
          "wind_full_rate_J-14"?: number | null
          "wind_full_rate_J-7"?: number | null
          z_debit_dl?: number | null
          z_debit_ul?: number | null
          z_dms_debit_dl_3?: number | null
          z_dms_debit_dl_30?: number | null
          z_dms_debit_dl_8?: number | null
          z_dms_debit_ul_1?: number | null
          z_dms_debit_ul_3?: number | null
          z_dms_debit_ul_5?: number | null
          z_fallback_5G_to_4G_rate?: number | null
          z_instability_rate?: number | null
          z_loss_dl_rate?: number | null
          z_loss_ul_rate?: number | null
          z_Mauvaise_Session_Rate?: number | null
          z_out_of_order_rate?: number | null
          z_qoe_index?: number | null
          z_rtt_data_avg?: number | null
          z_rtt_setup_avg?: number | null
          z_session_dcr?: number | null
          z_session_dur_moy?: number | null
          z_session_nbr?: number | null
          z_tcp_retr_rate_dl?: number | null
          z_tcp_retr_rate_ul?: number | null
          z_time_rat_4g_pct?: number | null
          z_time_rat_5g_pct?: number | null
          z_volume_totale_dl?: number | null
          z_volume_totale_ul?: number | null
          z_wind_full_rate?: number | null
        }
        Update: {
          "5G_capable_rate"?: number | null
          "5gue_attached_4G_rate"?: number | null
          created_at?: string | null
          date_part?: string
          debit_dl?: number | null
          debit_dl_delta14j_pct?: number | null
          debit_dl_delta7j_pct?: number | null
          "debit_dl_J-14"?: number | null
          "debit_dl_J-7"?: number | null
          debit_dl_max?: number | null
          debit_dl_vol10?: number | null
          debit_dl_vol5?: number | null
          debit_ul?: number | null
          debit_ul_delta14j_pct?: number | null
          debit_ul_delta7j_pct?: number | null
          "debit_ul_J-14"?: number | null
          "debit_ul_J-7"?: number | null
          debit_ul_max?: number | null
          debit_ul_vol10?: number | null
          debit_ul_vol5?: number | null
          dimension_1?: string
          dimension_2?: string
          dms_3_dl_vol10?: number | null
          dms_3_dl_vol5?: number | null
          dms_30_dl_vol10?: number | null
          dms_30_dl_vol5?: number | null
          dms_8_dl_vol10?: number | null
          dms_8_dl_vol5?: number | null
          dms_debit_dl_3?: number | null
          dms_debit_dl_3_delta14j_pct?: number | null
          dms_debit_dl_3_delta7j_pct?: number | null
          "dms_debit_dl_3_J-14"?: number | null
          "dms_debit_dl_3_J-7"?: number | null
          dms_debit_dl_30?: number | null
          dms_debit_dl_30_delta14j_pct?: number | null
          dms_debit_dl_30_delta7j_pct?: number | null
          "dms_debit_dl_30_J-14"?: number | null
          "dms_debit_dl_30_J-7"?: number | null
          dms_debit_dl_8?: number | null
          dms_debit_dl_8_delta14j_pct?: number | null
          dms_debit_dl_8_delta7j_pct?: number | null
          "dms_debit_dl_8_J-14"?: number | null
          "dms_debit_dl_8_J-7"?: number | null
          dms_debit_ul_1?: number | null
          dms_debit_ul_1_delta14j_pct?: number | null
          dms_debit_ul_1_delta7j_pct?: number | null
          "dms_debit_ul_1_J-14"?: number | null
          "dms_debit_ul_1_J-7"?: number | null
          dms_debit_ul_3?: number | null
          dms_debit_ul_3_delta14j_pct?: number | null
          dms_debit_ul_3_delta7j_pct?: number | null
          "dms_debit_ul_3_J-14"?: number | null
          "dms_debit_ul_3_J-7"?: number | null
          dms_debit_ul_5?: number | null
          dms_debit_ul_5_delta14j_pct?: number | null
          dms_debit_ul_5_delta7j_pct?: number | null
          "dms_debit_ul_5_J-14"?: number | null
          "dms_debit_ul_5_J-7"?: number | null
          fallback_4G_to_3G2G_rate?: number | null
          fallback_5G_to_4G_rate?: number | null
          fallback_5G_to_4G_rate_delta14j_pct?: number | null
          fallback_5G_to_4G_rate_delta7j_pct?: number | null
          "fallback_5G_to_4G_rate_J-14"?: number | null
          "fallback_5G_to_4G_rate_J-7"?: number | null
          id?: number
          instability_rate?: number | null
          instability_rate_delta14j_pct?: number | null
          instability_rate_delta7j_pct?: number | null
          "instability_rate_J-14"?: number | null
          "instability_rate_J-7"?: number | null
          "loss_dl_0_0.01"?: number | null
          "loss_dl_0.01_0.03"?: number | null
          "loss_dl_0.03_0.05"?: number | null
          "loss_dl_0.05_inf"?: number | null
          loss_dl_rate?: number | null
          loss_dl_rate_delta14j_pct?: number | null
          loss_dl_rate_delta7j_pct?: number | null
          "loss_dl_rate_J-14"?: number | null
          "loss_dl_rate_J-7"?: number | null
          "loss_ul_0_0.01"?: number | null
          "loss_ul_0.01_0.03"?: number | null
          "loss_ul_0.03_0.05"?: number | null
          "loss_ul_0.05_inf"?: number | null
          loss_ul_rate?: number | null
          loss_ul_rate_delta14j_pct?: number | null
          loss_ul_rate_delta7j_pct?: number | null
          "loss_ul_rate_J-14"?: number | null
          "loss_ul_rate_J-7"?: number | null
          Mauvaise_Session_nbr?: number | null
          Mauvaise_Session_Rate?: number | null
          Mauvaise_Session_Rate_delta14j_pct?: number | null
          Mauvaise_Session_Rate_delta7j_pct?: number | null
          "Mauvaise_Session_Rate_J-14"?: number | null
          "Mauvaise_Session_Rate_J-7"?: number | null
          out_of_order_nbr?: number | null
          out_of_order_rate?: number | null
          out_of_order_rate_delta14j_pct?: number | null
          out_of_order_rate_delta7j_pct?: number | null
          "out_of_order_rate_J-14"?: number | null
          "out_of_order_rate_J-7"?: number | null
          pct_debit_dl?: number | null
          pct_debit_ul?: number | null
          pct_dms_debit_dl_3?: number | null
          pct_dms_debit_dl_30?: number | null
          pct_dms_debit_dl_8?: number | null
          pct_dms_debit_ul_1?: number | null
          pct_dms_debit_ul_3?: number | null
          pct_dms_debit_ul_5?: number | null
          pct_fallback_5G_to_4G_rate?: number | null
          pct_instability_rate?: number | null
          pct_loss_dl_rate?: number | null
          pct_loss_ul_rate?: number | null
          pct_Mauvaise_Session_Rate?: number | null
          pct_out_of_order_rate?: number | null
          pct_qoe_index?: number | null
          pct_rtt_data_avg?: number | null
          pct_rtt_setup_avg?: number | null
          pct_session_dcr?: number | null
          pct_session_dur_moy?: number | null
          pct_session_nbr?: number | null
          pct_tcp_retr_rate_dl?: number | null
          pct_tcp_retr_rate_ul?: number | null
          pct_time_rat_4g_pct?: number | null
          pct_time_rat_5g_pct?: number | null
          pct_volume_totale_dl?: number | null
          pct_volume_totale_ul?: number | null
          pct_wind_full_rate?: number | null
          qoe_composite?: number | null
          qoe_index?: number | null
          qoe_index_delta14j_pct?: number | null
          qoe_index_delta7j_pct?: number | null
          "qoe_index_J-14"?: number | null
          "qoe_index_J-7"?: number | null
          "retr_dl_0_0.01"?: number | null
          "retr_dl_0.01_0.03"?: number | null
          "retr_dl_0.03_0.05"?: number | null
          "retr_dl_0.05_inf"?: number | null
          "retr_ul_0_0.01"?: number | null
          "retr_ul_0.01_0.03"?: number | null
          "retr_ul_0.03_0.05"?: number | null
          "retr_ul_0.05_inf"?: number | null
          rtt_data_0_40000?: number | null
          rtt_data_150000_300000?: number | null
          rtt_data_300000_inf?: number | null
          rtt_data_40000_80000?: number | null
          rtt_data_80000_150000?: number | null
          rtt_data_avg?: number | null
          rtt_data_avg_delta14j_pct?: number | null
          rtt_data_avg_delta7j_pct?: number | null
          "rtt_data_avg_J-14"?: number | null
          "rtt_data_avg_J-7"?: number | null
          rtt_setup_0_40000?: number | null
          rtt_setup_150000_300000?: number | null
          rtt_setup_300000_inf?: number | null
          rtt_setup_40000_80000?: number | null
          rtt_setup_80000_150000?: number | null
          rtt_setup_avg?: number | null
          rtt_setup_avg_delta14j_pct?: number | null
          rtt_setup_avg_delta7j_pct?: number | null
          "rtt_setup_avg_J-14"?: number | null
          "rtt_setup_avg_J-7"?: number | null
          score_debit?: number | null
          score_dms?: number | null
          score_drop?: number | null
          score_latence?: number | null
          score_loss?: number | null
          score_retr?: number | null
          score_stabilite?: number | null
          session_3g2g_nbr?: number | null
          session_4g_nbr?: number | null
          session_5g_nbr?: number | null
          session_dcr?: number | null
          session_dcr_delta14j_pct?: number | null
          session_dcr_delta7j_pct?: number | null
          "session_dcr_J-14"?: number | null
          "session_dcr_J-7"?: number | null
          session_dur_moy?: number | null
          session_dur_moy_delta14j_pct?: number | null
          session_dur_moy_delta7j_pct?: number | null
          "session_dur_moy_J-14"?: number | null
          "session_dur_moy_J-7"?: number | null
          session_nbr?: number | null
          session_nbr_delta14j_pct?: number | null
          session_nbr_delta7j_pct?: number | null
          "session_nbr_J-14"?: number | null
          "session_nbr_J-7"?: number | null
          session_wifi_nbr?: number | null
          tcp_retr_rate_dl?: number | null
          tcp_retr_rate_dl_delta14j_pct?: number | null
          tcp_retr_rate_dl_delta7j_pct?: number | null
          "tcp_retr_rate_dl_J-14"?: number | null
          "tcp_retr_rate_dl_J-7"?: number | null
          tcp_retr_rate_ul?: number | null
          tcp_retr_rate_ul_delta14j_pct?: number | null
          tcp_retr_rate_ul_delta7j_pct?: number | null
          "tcp_retr_rate_ul_J-14"?: number | null
          "tcp_retr_rate_ul_J-7"?: number | null
          time_rat_3g2g_pct?: number | null
          time_rat_4g_pct?: number | null
          time_rat_4g_pct_delta14j_pct?: number | null
          time_rat_4g_pct_delta7j_pct?: number | null
          "time_rat_4g_pct_J-14"?: number | null
          "time_rat_4g_pct_J-7"?: number | null
          time_rat_5g_pct?: number | null
          time_rat_5g_pct_delta14j_pct?: number | null
          time_rat_5g_pct_delta7j_pct?: number | null
          "time_rat_5g_pct_J-14"?: number | null
          "time_rat_5g_pct_J-7"?: number | null
          time_rat_wifi_pct?: number | null
          trend_debit_dl?: string | null
          trend_qoe?: string | null
          trend_rtt?: string | null
          volume_totale_dl?: number | null
          volume_totale_dl_delta14j_pct?: number | null
          volume_totale_dl_delta7j_pct?: number | null
          "volume_totale_dl_J-14"?: number | null
          "volume_totale_dl_J-7"?: number | null
          volume_totale_totale?: number | null
          volume_totale_ul?: number | null
          volume_totale_ul_delta14j_pct?: number | null
          volume_totale_ul_delta7j_pct?: number | null
          "volume_totale_ul_J-14"?: number | null
          "volume_totale_ul_J-7"?: number | null
          wind_full_nbr?: number | null
          wind_full_rate?: number | null
          wind_full_rate_delta14j_pct?: number | null
          wind_full_rate_delta7j_pct?: number | null
          "wind_full_rate_J-14"?: number | null
          "wind_full_rate_J-7"?: number | null
          z_debit_dl?: number | null
          z_debit_ul?: number | null
          z_dms_debit_dl_3?: number | null
          z_dms_debit_dl_30?: number | null
          z_dms_debit_dl_8?: number | null
          z_dms_debit_ul_1?: number | null
          z_dms_debit_ul_3?: number | null
          z_dms_debit_ul_5?: number | null
          z_fallback_5G_to_4G_rate?: number | null
          z_instability_rate?: number | null
          z_loss_dl_rate?: number | null
          z_loss_ul_rate?: number | null
          z_Mauvaise_Session_Rate?: number | null
          z_out_of_order_rate?: number | null
          z_qoe_index?: number | null
          z_rtt_data_avg?: number | null
          z_rtt_setup_avg?: number | null
          z_session_dcr?: number | null
          z_session_dur_moy?: number | null
          z_session_nbr?: number | null
          z_tcp_retr_rate_dl?: number | null
          z_tcp_retr_rate_ul?: number | null
          z_time_rat_4g_pct?: number | null
          z_time_rat_5g_pct?: number | null
          z_volume_totale_dl?: number | null
          z_volume_totale_ul?: number | null
          z_wind_full_rate?: number | null
        }
        Relationships: []
      }
      parameter_changes: {
        Row: {
          cell_name: string | null
          change_date: string
          change_scope: string
          change_type: string
          created_at: string
          description: string | null
          dor: string | null
          dr: string | null
          id: number
          new_value: string | null
          old_value: string | null
          param_name: string
          plaque: string | null
          site_name: string | null
          techno: string | null
          vendor: string | null
          zone_arcep: string | null
        }
        Insert: {
          cell_name?: string | null
          change_date: string
          change_scope?: string
          change_type?: string
          created_at?: string
          description?: string | null
          dor?: string | null
          dr?: string | null
          id?: never
          new_value?: string | null
          old_value?: string | null
          param_name: string
          plaque?: string | null
          site_name?: string | null
          techno?: string | null
          vendor?: string | null
          zone_arcep?: string | null
        }
        Update: {
          cell_name?: string | null
          change_date?: string
          change_scope?: string
          change_type?: string
          created_at?: string
          description?: string | null
          dor?: string | null
          dr?: string | null
          id?: never
          new_value?: string | null
          old_value?: string | null
          param_name?: string
          plaque?: string | null
          site_name?: string | null
          techno?: string | null
          vendor?: string | null
          zone_arcep?: string | null
        }
        Relationships: []
      }
      parameter_dump: {
        Row: {
          bande: string | null
          cell_dn: string | null
          cell_name: string | null
          dn: string | null
          dor: string | null
          enodeb_id: number | null
          gnodeb_id: number | null
          latitude: number | null
          longitude: number | null
          mrbts_id: number | null
          netact: string | null
          parameter: string
          plaque: string | null
          site_name: string | null
          value: string | null
          vendor: string | null
          version: string | null
          zone_arcep: string | null
        }
        Insert: {
          bande?: string | null
          cell_dn?: string | null
          cell_name?: string | null
          dn?: string | null
          dor?: string | null
          enodeb_id?: number | null
          gnodeb_id?: number | null
          latitude?: number | null
          longitude?: number | null
          mrbts_id?: number | null
          netact?: string | null
          parameter: string
          plaque?: string | null
          site_name?: string | null
          value?: string | null
          vendor?: string | null
          version?: string | null
          zone_arcep?: string | null
        }
        Update: {
          bande?: string | null
          cell_dn?: string | null
          cell_name?: string | null
          dn?: string | null
          dor?: string | null
          enodeb_id?: number | null
          gnodeb_id?: number | null
          latitude?: number | null
          longitude?: number | null
          mrbts_id?: number | null
          netact?: string | null
          parameter?: string
          plaque?: string | null
          site_name?: string | null
          value?: string | null
          vendor?: string | null
          version?: string | null
          zone_arcep?: string | null
        }
        Relationships: []
      }
      ping_stats: {
        Row: {
          id: string
          last_ping_at: string
          ping_count: number
          table_name: string
        }
        Insert: {
          id?: string
          last_ping_at?: string
          ping_count?: number
          table_name: string
        }
        Update: {
          id?: string
          last_ping_at?: string
          ping_count?: number
          table_name?: string
        }
        Relationships: []
      }
      rag_documents: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          filename: string
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          filename: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          filename?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      topo: {
        Row: {
          azimut: number | null
          bande: string | null
          cid: number | null
          code_nidt: string
          constructeur: string | null
          created_at: string | null
          date_fn8: string | null
          date_mes: string | null
          dor: string | null
          eci: number | null
          essentiel: string | null
          etat_cellule: string | null
          hba: number | null
          hebergeur_leader: string | null
          id: number
          lac: number | null
          latitude: number | null
          lcid: number | null
          longitude: number | null
          nci: number | null
          nom_cellule: string
          nom_site: string
          pci: number | null
          plaque: string | null
          region: string | null
          relative_id: string | null
          tac: number | null
          techno: string | null
          tilt: number | null
          zone_arcep: string | null
        }
        Insert: {
          azimut?: number | null
          bande?: string | null
          cid?: number | null
          code_nidt: string
          constructeur?: string | null
          created_at?: string | null
          date_fn8?: string | null
          date_mes?: string | null
          dor?: string | null
          eci?: number | null
          essentiel?: string | null
          etat_cellule?: string | null
          hba?: number | null
          hebergeur_leader?: string | null
          id?: number
          lac?: number | null
          latitude?: number | null
          lcid?: number | null
          longitude?: number | null
          nci?: number | null
          nom_cellule: string
          nom_site: string
          pci?: number | null
          plaque?: string | null
          region?: string | null
          relative_id?: string | null
          tac?: number | null
          techno?: string | null
          tilt?: number | null
          zone_arcep?: string | null
        }
        Update: {
          azimut?: number | null
          bande?: string | null
          cid?: number | null
          code_nidt?: string
          constructeur?: string | null
          created_at?: string | null
          date_fn8?: string | null
          date_mes?: string | null
          dor?: string | null
          eci?: number | null
          essentiel?: string | null
          etat_cellule?: string | null
          hba?: number | null
          hebergeur_leader?: string | null
          id?: number
          lac?: number | null
          latitude?: number | null
          lcid?: number | null
          longitude?: number | null
          nci?: number | null
          nom_cellule?: string
          nom_site?: string
          pci?: number | null
          plaque?: string | null
          region?: string | null
          relative_id?: string | null
          tac?: number | null
          techno?: string | null
          tilt?: number | null
          zone_arcep?: string | null
        }
        Relationships: []
      }
      user_kpi_favorites: {
        Row: {
          created_at: string
          id: string
          kpi_key: string
          module: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kpi_key: string
          module?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kpi_key?: string
          module?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_kpi_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          preferences: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dump_parameter_distinct_filters: { Args: never; Returns: Json }
      execute_parmy_sql: { Args: { query_sql: string }; Returns: Json }
      get_dashboard_sites: {
        Args: {
          p_bande?: string[]
          p_constructeur?: string[]
          p_dor?: string[]
          p_limit?: number
          p_plaque?: string[]
          p_search?: string
          p_techno?: string[]
          p_zone_arcep?: string[]
        }
        Returns: {
          code_nidt: string
          dor: string
          latitude: number
          longitude: number
          lte_cells: number
          nom_site: string
          nr_cells: number
          plaque: string
          region: string
          total_cells: number
          vendor: string
          zone_arcep: string
        }[]
      }
      get_site_cells: {
        Args: { p_code_nidt: string }
        Returns: {
          azimut: number
          bande: string
          cid: number
          constructeur: string
          date_fn8: string
          date_mes: string
          eci: number
          essentiel: string
          etat_cellule: string
          hba: number
          hebergeur_leader: string
          lac: number
          latitude: number
          longitude: number
          nci: number
          nom_cellule: string
          pci: number
          relative_id: string
          tac: number
          techno: string
          tilt: number
          zone_arcep: string
        }[]
      }
      increment_dashboard_view: { Args: { p_id: string }; Returns: number }
      match_documents: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          filename: string
          id: string
          similarity: number
        }[]
      }
      topo_distinct_values: {
        Args: { p_col: string; p_limit?: number; p_search?: string }
        Returns: {
          value: string
        }[]
      }
      topo_inventory_stats: { Args: never; Returns: Json }
      topo_perimeter_count: {
        Args: { p_filters?: Json; p_logic?: string }
        Returns: Json
      }
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
