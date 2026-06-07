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
      auth_otp_aliases: {
        Row: {
          created_at: string
          email: string
          email_type: string
          expires_at: string
          full_token: string
          id: string
          short_code: string
        }
        Insert: {
          created_at?: string
          email: string
          email_type: string
          expires_at: string
          full_token: string
          id?: string
          short_code: string
        }
        Update: {
          created_at?: string
          email?: string
          email_type?: string
          expires_at?: string
          full_token?: string
          id?: string
          short_code?: string
        }
        Relationships: []
      }
      call_stats: {
        Row: {
          call_count: number
          callee_id: string
          caller_id: string
          last_called_at: string
        }
        Insert: {
          call_count?: number
          callee_id: string
          caller_id: string
          last_called_at?: string
        }
        Update: {
          call_count?: number
          callee_id?: string
          caller_id?: string
          last_called_at?: string
        }
        Relationships: []
      }
      calls: {
        Row: {
          call_type: string
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          room_name: string
          status: string
          updated_at: string
        }
        Insert: {
          call_type: string
          callee_id: string
          caller_id: string
          conversation_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          room_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          call_type?: string
          callee_id?: string
          caller_id?: string
          conversation_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          room_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_backups: {
        Row: {
          auto_backup_enabled: boolean
          created_at: string
          last_backup_at: string
          manifest_path: string
          media_count: number
          message_count: number
          total_bytes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_backup_enabled?: boolean
          created_at?: string
          last_backup_at?: string
          manifest_path: string
          media_count?: number
          message_count?: number
          total_bytes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_backup_enabled?: boolean
          created_at?: string
          last_backup_at?: string
          manifest_path?: string
          media_count?: number
          message_count?: number
          total_bytes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
        }
        Relationships: []
      }
      deleted_accounts: {
        Row: {
          deleted_at: string
          email: string
          id: string
        }
        Insert: {
          deleted_at?: string
          email: string
          id?: string
        }
        Update: {
          deleted_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      device_login_challenges: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          device_id: string
          email: string
          expires_at: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          device_id: string
          email: string
          expires_at: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          device_id?: string
          email?: string
          expires_at?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      device_push_tokens: {
        Row: {
          created_at: string
          fcm_token: string
          id: string
          last_seen_at: string
          platform: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fcm_token: string
          id?: string
          last_seen_at?: string
          platform?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fcm_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      google_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          google_email: string | null
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          google_email?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          google_email?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_signin_attempts: {
        Row: {
          created_at: string
          google_email: string
          id: string
          intended_email: string
          ip_hash: string | null
          matched: boolean
        }
        Insert: {
          created_at?: string
          google_email: string
          id?: string
          intended_email: string
          ip_hash?: string | null
          matched: boolean
        }
        Update: {
          created_at?: string
          google_email?: string
          id?: string
          intended_email?: string
          ip_hash?: string | null
          matched?: boolean
        }
        Relationships: []
      }
      invites: {
        Row: {
          contact_name: string | null
          id: string
          invited_at: string
          inviter_id: string
          phone: string
        }
        Insert: {
          contact_name?: string | null
          id?: string
          invited_at?: string
          inviter_id: string
          phone: string
        }
        Update: {
          contact_name?: string | null
          id?: string
          invited_at?: string
          inviter_id?: string
          phone?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          deleted_for_everyone: boolean
          delivered_at: string | null
          edited_at: string | null
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          deleted_for_everyone?: boolean
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_for_everyone?: boolean
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          backup_email: string | null
          created_at: string
          display_name: string | null
          id: string
          is_online: boolean
          last_seen_at: string
          phone: string | null
          show_last_seen: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          backup_email?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_online?: boolean
          last_seen_at?: string
          phone?: string | null
          show_last_seen?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          backup_email?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_online?: boolean
          last_seen_at?: string
          phone?: string | null
          show_last_seen?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      typing_indicators: {
        Row: {
          conversation_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          created_at: string
          device_id: string
          device_label: string | null
          id: string
          last_verified_at: string
          platform: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_label?: string | null
          id?: string
          last_verified_at?: string
          platform?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_label?: string | null
          id?: string
          last_verified_at?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_identifier_status: {
        Args: { _email?: string; _phone?: string }
        Returns: Json
      }
      cleanup_expired_auth_otp_aliases: { Args: never; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      device_is_bound_to_other: {
        Args: { _device_id: string; _user_id: string }
        Returns: {
          other_display_name: string
          other_user_id: string
        }[]
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_user_by_backup_email: {
        Args: { _backup_email: string }
        Returns: string
      }
      get_my_profile_private: {
        Args: never
        Returns: {
          backup_email: string
          phone: string
        }[]
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      match_contacts_by_phone: {
        Args: { _phones: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          phone: string
          user_id: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      resolve_email_for_phone: { Args: { _phone: string }; Returns: Json }
      start_direct_conversation: {
        Args: { _other_user: string }
        Returns: string
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
