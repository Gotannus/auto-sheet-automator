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
      celetus_sales: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          buyer_document: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          campaign_id: string | null
          commission_value: number
          created_at: string
          doc_type: string | null
          fees: number | null
          gross_value: number | null
          id: string
          item_type: string | null
          kind: string
          line_item_code: string
          net_value: number | null
          offer_name: string | null
          payment_method: string | null
          product_id: string
          product_name: string | null
          quantity: number
          raw: Json | null
          recipient: string | null
          recipient_company: string | null
          recipient_type: string | null
          sale_date: string
          src: string
          src_tag: string | null
          status: string
          transaction_code: string
          user_id: string
          utm_source: string | null
          utm_status: string | null
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          buyer_document?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          campaign_id?: string | null
          commission_value?: number
          created_at?: string
          doc_type?: string | null
          fees?: number | null
          gross_value?: number | null
          id?: string
          item_type?: string | null
          kind: string
          line_item_code?: string
          net_value?: number | null
          offer_name?: string | null
          payment_method?: string | null
          product_id: string
          product_name?: string | null
          quantity?: number
          raw?: Json | null
          recipient?: string | null
          recipient_company?: string | null
          recipient_type?: string | null
          sale_date: string
          src: string
          src_tag?: string | null
          status: string
          transaction_code: string
          user_id: string
          utm_source?: string | null
          utm_status?: string | null
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          buyer_document?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          campaign_id?: string | null
          commission_value?: number
          created_at?: string
          doc_type?: string | null
          fees?: number | null
          gross_value?: number | null
          id?: string
          item_type?: string | null
          kind?: string
          line_item_code?: string
          net_value?: number | null
          offer_name?: string | null
          payment_method?: string | null
          product_id?: string
          product_name?: string | null
          quantity?: number
          raw?: Json | null
          recipient?: string | null
          recipient_company?: string | null
          recipient_type?: string | null
          sale_date?: string
          src?: string
          src_tag?: string | null
          status?: string
          transaction_code?: string
          user_id?: string
          utm_source?: string | null
          utm_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "celetus_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          hotmart_hottok: string | null
          id: string
          name: string
          owner_user_id: string
          slug: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          created_at?: string
          hotmart_hottok?: string | null
          id?: string
          name: string
          owner_user_id: string
          slug: string
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          created_at?: string
          hotmart_hottok?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          slug?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_manual_inputs: {
        Row: {
          checkouts: number | null
          clicks: number | null
          created_at: string
          date: string
          id: string
          impressions: number | null
          invest_manual: number | null
          notes: string | null
          product_id: string
          revenue_override: number | null
          sales_override: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkouts?: number | null
          clicks?: number | null
          created_at?: string
          date: string
          id?: string
          impressions?: number | null
          invest_manual?: number | null
          notes?: string | null
          product_id: string
          revenue_override?: number | null
          sales_override?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkouts?: number | null
          clicks?: number | null
          created_at?: string
          date?: string
          id?: string
          impressions?: number | null
          invest_manual?: number | null
          notes?: string | null
          product_id?: string
          revenue_override?: number | null
          sales_override?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_manual_inputs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_expenses_items: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          description: string
          id: string
          month: number
          notes: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          date: string
          description: string
          id?: string
          month: number
          notes?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description?: string
          id?: string
          month?: number
          notes?: string | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      monthly_settings: {
        Row: {
          created_at: string
          id: string
          tax_rate: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          tax_rate?: number
          updated_at?: string
          user_id: string
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          tax_rate?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      monthly_tax_settings: {
        Row: {
          company_cash_rate: number
          created_at: string
          id: string
          investment_tax_rate: number
          month: number
          monthly_expenses: number
          partner_1_name: string
          partner_1_rate: number
          partner_2_name: string
          partner_2_rate: number
          revenue_tax_rate: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          company_cash_rate?: number
          created_at?: string
          id?: string
          investment_tax_rate?: number
          month: number
          monthly_expenses?: number
          partner_1_name?: string
          partner_1_rate?: number
          partner_2_name?: string
          partner_2_rate?: number
          revenue_tax_rate?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          company_cash_rate?: number
          created_at?: string
          id?: string
          investment_tax_rate?: number
          month?: number
          monthly_expenses?: number
          partner_1_name?: string
          partner_1_rate?: number
          partner_2_name?: string
          partner_2_rate?: number
          revenue_tax_rate?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          name: string
          src: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          name: string
          src: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          name?: string
          src?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_config: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          webhook_secret: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          webhook_secret?: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          error_message: string | null
          file_name: string | null
          id: string
          kind: string
          payload: Json | null
          products_created: number | null
          received_at: string
          reprocessed_at: string | null
          rows_ignored: number | null
          rows_read: number | null
          rows_upserted: number | null
          status: string
          transaction_code: string | null
          user_id: string
        }
        Insert: {
          error_message?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          products_created?: number | null
          received_at?: string
          reprocessed_at?: string | null
          rows_ignored?: number | null
          rows_read?: number | null
          rows_upserted?: number | null
          status: string
          transaction_code?: string | null
          user_id: string
        }
        Update: {
          error_message?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          products_created?: number | null
          received_at?: string
          reprocessed_at?: string | null
          rows_ignored?: number | null
          rows_read?: number | null
          rows_upserted?: number | null
          status?: string
          transaction_code?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_company_access: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
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
