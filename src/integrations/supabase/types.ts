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
      backup_offers: {
        Row: {
          backup_request_id: string
          booking_id: string | null
          claim_token: string
          created_at: string
          evening_id: string
          expires_at: string
          family_id: string
          freed_by_booking_id: string | null
          id: string
          offered_at: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["offer_status"]
        }
        Insert: {
          backup_request_id: string
          booking_id?: string | null
          claim_token?: string
          created_at?: string
          evening_id: string
          expires_at?: string
          family_id: string
          freed_by_booking_id?: string | null
          id?: string
          offered_at?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Update: {
          backup_request_id?: string
          booking_id?: string | null
          claim_token?: string
          created_at?: string
          evening_id?: string
          expires_at?: string
          family_id?: string
          freed_by_booking_id?: string | null
          id?: string
          offered_at?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Relationships: [
          {
            foreignKeyName: "backup_offers_backup_request_id_fkey"
            columns: ["backup_request_id"]
            isOneToOne: false
            referencedRelation: "backup_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_offers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_offers_evening_id_fkey"
            columns: ["evening_id"]
            isOneToOne: false
            referencedRelation: "evenings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_offers_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_offers_freed_by_booking_id_fkey"
            columns: ["freed_by_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_requests: {
        Row: {
          created_at: string
          family_id: string
          id: string
          nights: string[]
          note: string
          status: Database["public"]["Enums"]["backup_status"]
          weekend_start: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          nights?: string[]
          note?: string
          status?: Database["public"]["Enums"]["backup_status"]
          weekend_start: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          nights?: string[]
          note?: string
          status?: Database["public"]["Enums"]["backup_status"]
          weekend_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_links: {
        Row: {
          booking_id: string | null
          created_at: string
          evening_id: string
          expires_at: string
          family_id: string
          request_id: string | null
          source: Database["public"]["Enums"]["booking_source"]
          token: string
          used_at: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          evening_id: string
          expires_at?: string
          family_id: string
          request_id?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          token?: string
          used_at?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          evening_id?: string
          expires_at?: string
          family_id?: string
          request_id?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_links_evening_id_fkey"
            columns: ["evening_id"]
            isOneToOne: false
            referencedRelation: "evenings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_links_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_links_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancelled_at: string | null
          confirmation_sent_at: string | null
          created_at: string
          evening_id: string
          family_id: string
          hold_amount_cents: number
          hold_status: Database["public"]["Enums"]["hold_status"]
          id: string
          late_cancellation: boolean
          rate_cents: number
          refill_of_booking_id: string | null
          reminder_sent_at: string | null
          source: Database["public"]["Enums"]["booking_source"]
          status: Database["public"]["Enums"]["booking_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          evening_id: string
          family_id: string
          hold_amount_cents?: number
          hold_status?: Database["public"]["Enums"]["hold_status"]
          id?: string
          late_cancellation?: boolean
          rate_cents: number
          refill_of_booking_id?: string | null
          reminder_sent_at?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          evening_id?: string
          family_id?: string
          hold_amount_cents?: number
          hold_status?: Database["public"]["Enums"]["hold_status"]
          id?: string
          late_cancellation?: boolean
          rate_cents?: number
          refill_of_booking_id?: string | null
          reminder_sent_at?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_evening_id_fkey"
            columns: ["evening_id"]
            isOneToOne: false
            referencedRelation: "evenings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_refill_of_booking_id_fkey"
            columns: ["refill_of_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          booking_id: string | null
          created_at: string
          error: string | null
          family_id: string | null
          html_body: string
          id: string
          kind: Database["public"]["Enums"]["email_kind"]
          offer_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          text_body: string
          to_email: string
          to_name: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          error?: string | null
          family_id?: string | null
          html_body: string
          id?: string
          kind: Database["public"]["Enums"]["email_kind"]
          offer_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject: string
          text_body: string
          to_email: string
          to_name: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          error?: string | null
          family_id?: string | null
          html_body?: string
          id?: string
          kind?: Database["public"]["Enums"]["email_kind"]
          offer_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          text_body?: string
          to_email?: string
          to_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "backup_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      evenings: {
        Row: {
          created_at: string
          ends_at: string
          held_for_family_id: string | null
          held_until: string | null
          id: string
          starts_at: string
          status: Database["public"]["Enums"]["evening_status"]
        }
        Insert: {
          created_at?: string
          ends_at: string
          held_for_family_id?: string | null
          held_until?: string | null
          id?: string
          starts_at: string
          status?: Database["public"]["Enums"]["evening_status"]
        }
        Update: {
          created_at?: string
          ends_at?: string
          held_for_family_id?: string | null
          held_until?: string | null
          id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["evening_status"]
        }
        Relationships: [
          {
            foreignKeyName: "evenings_held_for_family_id_fkey"
            columns: ["held_for_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          address: string
          card_brand: string | null
          card_last4: string | null
          card_on_file: boolean
          created_at: string
          default_rate_cents: number
          email: string
          family_name: string
          id: string
          is_trusted: boolean
          kids_summary: string
          notes: string
          parent_name: string
          phone: string
          stripe_customer_id: string | null
        }
        Insert: {
          address: string
          card_brand?: string | null
          card_last4?: string | null
          card_on_file?: boolean
          created_at?: string
          default_rate_cents: number
          email: string
          family_name: string
          id?: string
          is_trusted?: boolean
          kids_summary: string
          notes?: string
          parent_name: string
          phone: string
          stripe_customer_id?: string | null
        }
        Update: {
          address?: string
          card_brand?: string | null
          card_last4?: string | null
          card_on_file?: boolean
          created_at?: string
          default_rate_cents?: number
          email?: string
          family_name?: string
          id?: string
          is_trusted?: boolean
          kids_summary?: string
          notes?: string
          parent_name?: string
          phone?: string
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      requests: {
        Row: {
          answered_while_unavailable: boolean
          channel: Database["public"]["Enums"]["request_channel"]
          created_at: string
          desired_window: string
          family_id: string | null
          id: string
          matched_evening_ids: string[]
          message: string
          reply_text: string | null
          sender_name: string | null
          sender_phone: string | null
        }
        Insert: {
          answered_while_unavailable?: boolean
          channel?: Database["public"]["Enums"]["request_channel"]
          created_at?: string
          desired_window?: string
          family_id?: string | null
          id?: string
          matched_evening_ids?: string[]
          message: string
          reply_text?: string | null
          sender_name?: string | null
          sender_phone?: string | null
        }
        Update: {
          answered_while_unavailable?: boolean
          channel?: Database["public"]["Enums"]["request_channel"]
          created_at?: string
          desired_window?: string
          family_id?: string | null
          id?: string
          matched_evening_ids?: string[]
          message?: string
          reply_text?: string | null
          sender_name?: string | null
          sender_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
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
      ensure_upcoming_evenings: { Args: { _weeks?: number }; Returns: number }
    }
    Enums: {
      app_role: "sitter"
      backup_status: "waiting" | "offered" | "claimed" | "expired" | "withdrawn"
      booking_source: "web" | "inbound" | "backup"
      booking_status: "confirmed" | "cancelled" | "completed"
      email_kind:
        | "confirmation"
        | "reminder"
        | "backup_offer"
        | "cancellation"
        | "refill_confirmed"
        | "hold_released"
      email_status: "queued" | "sent" | "failed" | "skipped"
      evening_status: "open" | "held" | "booked"
      hold_status: "none" | "held" | "released" | "kept"
      offer_status:
        | "pending"
        | "claimed"
        | "expired"
        | "declined"
        | "superseded"
      request_channel: "web" | "inbound"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["sitter"],
      backup_status: ["waiting", "offered", "claimed", "expired", "withdrawn"],
      booking_source: ["web", "inbound", "backup"],
      booking_status: ["confirmed", "cancelled", "completed"],
      email_kind: [
        "confirmation",
        "reminder",
        "backup_offer",
        "cancellation",
        "refill_confirmed",
        "hold_released",
      ],
      email_status: ["queued", "sent", "failed", "skipped"],
      evening_status: ["open", "held", "booked"],
      hold_status: ["none", "held", "released", "kept"],
      offer_status: ["pending", "claimed", "expired", "declined", "superseded"],
      request_channel: ["web", "inbound"],
    },
  },
} as const
