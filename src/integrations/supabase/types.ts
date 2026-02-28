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
      dashboards: {
        Row: {
          created_at: string
          description: string
          id: string
          is_archived: boolean
          is_shared: boolean
          name: string
          updated_at: string
          widgets: Json
        }
        Insert: {
          created_at?: string
          description?: string
          id: string
          is_archived?: boolean
          is_shared?: boolean
          name: string
          updated_at?: string
          widgets?: Json
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_archived?: boolean
          is_shared?: boolean
          name?: string
          updated_at?: string
          widgets?: Json
        }
        Relationships: []
      }
      dump_parameter: {
        Row: {
          bande: string | null
          cell_dn: string | null
          cell_name: string | null
          city: string | null
          created_at: string | null
          dn: string | null
          dor: string | null
          dr: string | null
          enodeb_id: number | null
          freq_downlink: number | null
          gnodeb_id: number | null
          id: number
          latitude: number | null
          longitude: number | null
          mrbts_id: number | null
          omc: string | null
          parameter: string
          plaque: string | null
          site_name: string | null
          tgv: number | null
          ur: string | null
          value: string | null
          vendor: string | null
          version: string | null
          zone_arcep: string | null
        }
        Insert: {
          bande?: string | null
          cell_dn?: string | null
          cell_name?: string | null
          city?: string | null
          created_at?: string | null
          dn?: string | null
          dor?: string | null
          dr?: string | null
          enodeb_id?: number | null
          freq_downlink?: number | null
          gnodeb_id?: number | null
          id?: never
          latitude?: number | null
          longitude?: number | null
          mrbts_id?: number | null
          omc?: string | null
          parameter: string
          plaque?: string | null
          site_name?: string | null
          tgv?: number | null
          ur?: string | null
          value?: string | null
          vendor?: string | null
          version?: string | null
          zone_arcep?: string | null
        }
        Update: {
          bande?: string | null
          cell_dn?: string | null
          cell_name?: string | null
          city?: string | null
          created_at?: string | null
          dn?: string | null
          dor?: string | null
          dr?: string | null
          enodeb_id?: number | null
          freq_downlink?: number | null
          gnodeb_id?: number | null
          id?: never
          latitude?: number | null
          longitude?: number | null
          mrbts_id?: number | null
          omc?: string | null
          parameter?: string
          plaque?: string | null
          site_name?: string | null
          tgv?: number | null
          ur?: string | null
          value?: string | null
          vendor?: string | null
          version?: string | null
          zone_arcep?: string | null
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
      qoe_metrics: {
        Row: {
          bande: string | null
          cell_id: string
          created_at: string | null
          dms_dl_3: number | null
          dms_dl_30: number | null
          dms_dl_8: number | null
          dms_ul_3: number | null
          dt: string
          id: number
          loss_dn_sum: number | null
          out_of_order_rate: number | null
          p50_thr_dn_mbps: number | null
          p50_thr_up_mbps: number | null
          p95_rtt_ms: number | null
          qoe_score_avg: number | null
          retransmission_rate: number | null
          service: string
          sessions: number | null
          site_id: string | null
          tcp_loss_rate: number | null
          techno: string | null
          traffic_dn_bytes: number | null
          traffic_up_bytes: number | null
          window_full_ratio: number | null
        }
        Insert: {
          bande?: string | null
          cell_id: string
          created_at?: string | null
          dms_dl_3?: number | null
          dms_dl_30?: number | null
          dms_dl_8?: number | null
          dms_ul_3?: number | null
          dt: string
          id?: number
          loss_dn_sum?: number | null
          out_of_order_rate?: number | null
          p50_thr_dn_mbps?: number | null
          p50_thr_up_mbps?: number | null
          p95_rtt_ms?: number | null
          qoe_score_avg?: number | null
          retransmission_rate?: number | null
          service?: string
          sessions?: number | null
          site_id?: string | null
          tcp_loss_rate?: number | null
          techno?: string | null
          traffic_dn_bytes?: number | null
          traffic_up_bytes?: number | null
          window_full_ratio?: number | null
        }
        Update: {
          bande?: string | null
          cell_id?: string
          created_at?: string | null
          dms_dl_3?: number | null
          dms_dl_30?: number | null
          dms_dl_8?: number | null
          dms_ul_3?: number | null
          dt?: string
          id?: number
          loss_dn_sum?: number | null
          out_of_order_rate?: number | null
          p50_thr_dn_mbps?: number | null
          p50_thr_up_mbps?: number | null
          p95_rtt_ms?: number | null
          qoe_score_avg?: number | null
          retransmission_rate?: number | null
          service?: string
          sessions?: number | null
          site_id?: string | null
          tcp_loss_rate?: number | null
          techno?: string | null
          traffic_dn_bytes?: number | null
          traffic_up_bytes?: number | null
          window_full_ratio?: number | null
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
          id: number
          latitude: number | null
          longitude: number | null
          nci: number | null
          nom_cellule: string
          nom_site: string
          pci: number | null
          plaque: string | null
          region: string | null
          remote_electrical_tilt: number | null
          tac: number | null
          techno: string | null
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
          id?: never
          latitude?: number | null
          longitude?: number | null
          nci?: number | null
          nom_cellule: string
          nom_site: string
          pci?: number | null
          plaque?: string | null
          region?: string | null
          remote_electrical_tilt?: number | null
          tac?: number | null
          techno?: string | null
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
          id?: never
          latitude?: number | null
          longitude?: number | null
          nci?: number | null
          nom_cellule?: string
          nom_site?: string
          pci?: number | null
          plaque?: string | null
          region?: string | null
          remote_electrical_tilt?: number | null
          tac?: number | null
          techno?: string | null
          zone_arcep?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dump_parameter_distinct_filters: { Args: never; Returns: Json }
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
