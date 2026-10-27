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
    PostgrestVersion: "14.2"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          answers: Json | null
          attendee_id: string
          checked_in_at: string
          id: string
          meeting_id: string
          org_id: string
          source: string | null
        }
        Insert: {
          answers?: Json | null
          attendee_id: string
          checked_in_at?: string
          id?: string
          meeting_id: string
          org_id: string
          source?: string | null
        }
        Update: {
          answers?: Json | null
          attendee_id?: string
          checked_in_at?: string
          id?: string
          meeting_id?: string
          org_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendees: {
        Row: {
          admin: boolean | null
          created_at: string
          email: string
          first_name: string
          grad_year: string
          id: string
          last_name: string
          user_id: string | null
        }
        Insert: {
          admin?: boolean | null
          created_at?: string
          email: string
          first_name: string
          grad_year: string
          id?: string
          last_name: string
          user_id?: string | null
        }
        Update: {
          admin?: boolean | null
          created_at?: string
          email?: string
          first_name?: string
          grad_year?: string
          id?: string
          last_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          id: number
          metadata: Json
          org_id: string | null
          scope: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          created_at?: string
          id?: number
          metadata?: Json
          org_id?: string | null
          scope: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          id?: number
          metadata?: Json
          org_id?: string | null
          scope?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          checkin_password: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          form_schema: Json
          id: string
          is_geo_locked: boolean
          is_officer_only: boolean
          latitude: number | null
          longitude: number | null
          org_id: string
          questions: string[] | null
          radius_meters: number | null
          requires_checkin_password: boolean | null
          start_time: string | null
          status: boolean
          title: string
        }
        Insert: {
          checkin_password?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          form_schema?: Json
          id?: string
          is_geo_locked?: boolean
          is_officer_only?: boolean
          latitude?: number | null
          longitude?: number | null
          org_id: string
          questions?: string[] | null
          radius_meters?: number | null
          requires_checkin_password?: boolean | null
          start_time?: string | null
          status?: boolean
          title: string
        }
        Update: {
          checkin_password?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          form_schema?: Json
          id?: string
          is_geo_locked?: boolean
          is_officer_only?: boolean
          latitude?: number | null
          longitude?: number | null
          org_id?: string
          questions?: string[] | null
          radius_meters?: number | null
          requires_checkin_password?: boolean | null
          start_time?: string | null
          status?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string | null
          org_id: string
          role: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          org_id: string
          role: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          org_id?: string
          role?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memerships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          branding: Json | null
          created_at: string
          id: string
          name: string | null
          slug: string | null
        }
        Insert: {
          branding?: Json | null
          created_at?: string
          id?: string
          name?: string | null
          slug?: string | null
        }
        Update: {
          branding?: Json | null
          created_at?: string
          id?: string
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _appointment_ceiling: { Args: { p_org_id: string }; Returns: number }
      _effective_org_role: { Args: { p_org_id: string }; Returns: string }
      _role_level: { Args: { p_role: string }; Returns: number }
      _write_audit_log: {
        Args: {
          p_action: string
          p_actor_id?: string
          p_metadata?: Json
          p_org_id: string
          p_scope: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      close_expired_meetings: { Args: never; Returns: undefined }
      current_attendee_id: { Args: never; Returns: string }
      current_clerk_id: { Args: never; Returns: string }
      get_meeting_password: { Args: { p_meeting_id: string }; Returns: string }
      get_member_meetings_page: {
        Args: {
          p_attendee_id: string
          p_end: string
          p_limit: number
          p_offset: number
          p_org_id: string
          p_start: string
          p_view: string
        }
        Returns: {
          attended: boolean
          description: string
          form_schema: Json
          id: string
          start_time: string
          title: string
          total_count: number
        }[]
      }
      has_org_role: {
        Args: { p_org_id: string; p_roles: string[] }
        Returns: boolean
      }
      invite_org_member: {
        Args: { p_email: string; p_org_id: string; p_role: string }
        Returns: undefined
      }
      is_global_admin: { Args: never; Returns: boolean }
      is_org_officer: { Args: { p_org_id: string }; Returns: boolean }
      log_attendance_export: {
        Args: { p_meeting_id: string; p_row_count: number }
        Returns: undefined
      }
      my_org_membership: {
        Args: { p_org_id: string }
        Returns: {
          is_global_admin: boolean
          role: string
          status: string
        }[]
      }
      officer_manual_checkin: {
        Args: { p_meeting_id: string; p_target_user_id: string }
        Returns: undefined
      }
      remove_org_member: {
        Args: { p_org_id: string; p_target_user_id: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_new_role: string; p_org_id: string; p_target_user_id: string }
        Returns: undefined
      }
      transfer_org_ownership: {
        Args: { p_new_owner_user_id: string; p_org_id: string }
        Returns: undefined
      }
      verify_meeting_checkin_password: {
        Args: { p_meeting_id: string; p_password: string }
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {},
  },
} as const

