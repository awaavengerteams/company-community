/**
 * Type ของฐานข้อมูล — ตรงกับ supabase/migrations/0001–0007
 *
 * ★ ไฟล์นี้เขียนด้วยมือให้ตรงกับ migration แบบบรรทัดต่อบรรทัด
 *   เมื่อรันฐานข้อมูลได้แล้วให้ generate ทับเพื่อยืนยันว่าตรงกันจริง:
 *
 *     npm run db:types          # local
 *     npx supabase gen types typescript --project-id <ref> > types/database.ts
 *
 *   ถ้า diff ออกมาไม่ว่าง แปลว่า migration กับที่เข้าใจไว้ไม่ตรงกัน — ต้องแก้
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MemberRole = 'OWNER' | 'MEMBER' | 'GUEST'

export type QueueStatus = 'WAITING' | 'PLAYING' | 'PLAYED' | 'SKIPPED' | 'REMOVED'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          /** ฉายา — ข้อความรองใต้ชื่อ */
          nickname: string | null
          /** ชื่อผู้ใช้สำหรับเข้าใช้งานข้ามเครื่อง (พิมพ์เล็กเสมอ) */
          username: string | null
          /** หน้าตาตัวละครในลอบบี้ (0019) — jsonb ดิบ sanitize ตอนใช้ */
          appearance: unknown
          is_guest: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string
          avatar_url?: string | null
          nickname?: string | null
          username?: string | null
          is_guest?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string
          avatar_url?: string | null
          nickname?: string | null
          username?: string | null
          is_guest?: boolean
          updated_at?: string
        }
        Relationships: []
      }

      chat_messages: {
        Row: {
          id: string
          room_id: string
          user_id: string
          text: string
          image_url: string | null
          image_width: number | null
          image_height: number | null
          mentions: { id: string; name: string }[]
          reply_to: {
            id: string
            displayName: string
            text: string
            hasImage: boolean
          } | null
          deleted_at: string | null
          /** true = วาดใหญ่ ไม่มีฟองข้อความ */
          is_sticker: boolean
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }

      room_stickers: {
        Row: {
          id: string
          room_id: string
          url: string
          width: number | null
          height: number | null
          created_by: string | null
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }

      chat_reactions: {
        Row: {
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }

      rooms: {
        Row: {
          id: string
          code: string
          name: string
          owner_id: string
          is_locked: boolean
          allow_guest_add: boolean
          allow_member_skip: boolean
          allow_member_control: boolean
          max_queue_size: number
          chat_theme: string | null
          chat_wallpaper: string | null
          chat_wallpaper_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name?: string
          owner_id: string
          is_locked?: boolean
          allow_guest_add?: boolean
          allow_member_skip?: boolean
          allow_member_control?: boolean
          max_queue_size?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          is_locked?: boolean
          allow_guest_add?: boolean
          allow_member_skip?: boolean
          allow_member_control?: boolean
          max_queue_size?: number
          updated_at?: string
        }
        Relationships: []
      }

      room_members: {
        Row: {
          id: string
          room_id: string
          user_id: string
          role: MemberRole
          /** เจ้าของห้องมอบสิทธิ์ลัดคิว/ข้ามเพลงให้หรือยัง (OWNER มีเสมอ) */
          can_skip: boolean
          joined_at: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          room_id: string
          user_id: string
          role?: MemberRole
          can_skip?: boolean
          joined_at?: string
          last_seen_at?: string
        }
        Update: {
          role?: MemberRole
          can_skip?: boolean
          last_seen_at?: string
        }
        Relationships: []
      }

      quiz_games: {
        Row: QuizGameRow
        Insert: Partial<QuizGameRow> & { room_id: string; host_id: string; total_rounds: number }
        Update: Partial<QuizGameRow>
        Relationships: []
      }
      quiz_scores: {
        Row: { game_id: string; user_id: string; points: number }
        Insert: { game_id: string; user_id: string; points?: number }
        Update: { points?: number }
        Relationships: []
      }
      /**
       * ★★★ quiz_rounds ไม่มีชนิดที่นี่โดยตั้งใจ — และห้ามเพิ่ม
       *     มันเก็บเฉลย การมีชนิดให้ใช้คือคำเชิญให้เผลอ select มันออกไป
       *     ★ ทุกอย่างที่ฝั่งไหนก็ตามต้องรู้ ถูกคัดลอกไว้ใน quiz_games แล้ว
       */
      skip_votes: {
        Row: { room_id: string; queue_item_id: string; user_id: string; created_at: string }
        Insert: { room_id: string; queue_item_id: string; user_id: string }
        Update: never
        Relationships: []
      }
      queue_items: {
        Row: {
          id: string
          room_id: string
          video_id: string
          title: string
          channel_title: string | null
          thumbnail_url: string | null
          /** วินาที */
          duration: number
          /** เพิ่มขึ้นเรื่อย ๆ ต่อห้อง ไม่เคยใช้ซ้ำ */
          position: number
          status: QueueStatus
          added_by: string | null
          /** ★ ขอเพลงนี้ให้ใคร — null = เพิ่มตามปกติ */
          dedicated_to: string | null
          dedication: string | null
          started_at: string | null
          ended_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          room_id: string
          video_id: string
          title: string
          channel_title?: string | null
          thumbnail_url?: string | null
          duration: number
          position: number
          status?: QueueStatus
          added_by?: string | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: QueueStatus
          started_at?: string | null
          ended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      playback_states: {
        Row: {
          room_id: string
          queue_item_id: string | null
          video_id: string | null
          is_playing: boolean
          /** anchor เวลาฝั่ง server — ดูนิยามใน 0002_tables.sql */
          started_at: string | null
          paused_at: string | null
          /** วินาทีที่ freeze ไว้ตอน pause/seek */
          current_position: number
          /** เพิ่มขึ้นทุกครั้งที่เขียน — ใช้ทิ้ง realtime payload ที่มาผิดลำดับ */
          version: number
          updated_at: string
        }
        Insert: {
          room_id: string
          queue_item_id?: string | null
          video_id?: string | null
          is_playing?: boolean
          started_at?: string | null
          paused_at?: string | null
          current_position?: number
          version?: number
          updated_at?: string
        }
        Update: {
          queue_item_id?: string | null
          video_id?: string | null
          is_playing?: boolean
          started_at?: string | null
          paused_at?: string | null
          current_position?: number
          version?: number
          updated_at?: string
        }
        Relationships: []
      }

      youtube_search_cache: {
        Row: {
          query_key: string
          page_token: string
          results: Json
          fetched_at: string
        }
        Insert: {
          query_key: string
          page_token?: string
          results: Json
          fetched_at?: string
        }
        Update: {
          results?: Json
          fetched_at?: string
        }
        Relationships: []
      }

      youtube_videos: {
        Row: {
          video_id: string
          title: string
          channel_title: string | null
          thumbnail_url: string | null
          duration: number
          embeddable: boolean
          unavailable_reason: string | null
          fetched_at: string
        }
        Insert: {
          video_id: string
          title: string
          channel_title?: string | null
          thumbnail_url?: string | null
          duration: number
          embeddable?: boolean
          unavailable_reason?: string | null
          fetched_at?: string
        }
        Update: {
          title?: string
          channel_title?: string | null
          thumbnail_url?: string | null
          duration?: number
          embeddable?: boolean
          unavailable_reason?: string | null
          fetched_at?: string
        }
        Relationships: []
      }

      rate_limits: {
        Row: {
          bucket_key: string
          window_start: string
          counter: number
        }
        Insert: {
          bucket_key: string
          window_start: string
          counter?: number
        }
        Update: {
          counter?: number
        }
        Relationships: []
      }
    }

    Views: Record<never, never>

    Functions: {
      create_room: {
        Args: { p_owner: string; p_name?: string | null }
        Returns: Database['public']['Tables']['rooms']['Row']
      }
      join_room: {
        Args: { p_code: string; p_user: string }
        Returns: Database['public']['Tables']['rooms']['Row']
      }
      touch_member: {
        Args: { p_room_id: string; p_user: string }
        Returns: undefined
      }
      transfer_ownership: {
        Args: { p_room_id: string; p_actor: string; p_target: string }
        Returns: Database['public']['Tables']['room_members']['Row']
      }
      room_heartbeat: {
        Args: {
          p_room_id: string
          p_actor: string
          p_owner_away_seconds?: number
          p_active_seconds?: number
        }
        /** user_id ของเจ้าของห้อง ณ ตอนจบ (อาจเปลี่ยนคนถ้าเจ้าของเดิมหายไปนาน) */
        Returns: string
      }
      enqueue_track: {
        Args: {
          p_room_id: string
          p_actor: string
          p_video_id: string
          p_title: string
          p_channel: string | null
          p_thumb: string | null
          p_duration: number
          p_dedicated_to?: string | null
          p_dedication?: string | null
        }
        Returns: Database['public']['Tables']['queue_items']['Row']
      }
      set_chat_style: {
        Args: {
          p_room_id: string
          p_actor: string
          p_theme: string | null
          p_wallpaper: string | null
          p_wallpaper_url?: string | null
        }
        Returns: Database['public']['Tables']['rooms']['Row']
      }
      toggle_skip_vote: {
        Args: { p_room_id: string; p_actor: string }
        Returns: { voted: boolean; votes: number; needed: number; skipped: boolean }
      }
      quiz_start: {
        Args: { p_room_id: string; p_actor: string; p_rounds: number }
        Returns: QuizGameRow
      }
      quiz_answer: {
        Args: { p_room_id: string; p_actor: string; p_guess: string }
        Returns: { active: boolean; correct?: boolean; answer?: string }
      }
      quiz_next: {
        Args: { p_room_id: string; p_actor: string }
        Returns: QuizGameRow
      }
      quiz_stop: {
        Args: { p_room_id: string; p_actor: string }
        Returns: void
      }
      advance_queue: {
        Args: {
          p_room_id: string
          p_actor: string | null
          p_expected_id: string | null
          p_reason: 'ENDED' | 'SKIPPED'
        }
        Returns: Database['public']['Tables']['playback_states']['Row']
      }
      set_playback: {
        Args: {
          p_room_id: string
          p_actor: string
          p_action: 'PLAY' | 'PAUSE' | 'SEEK'
          p_position?: number | null
        }
        Returns: Database['public']['Tables']['playback_states']['Row']
      }
      play_queue_item: {
        Args: { p_room_id: string; p_actor: string; p_item_id: string }
        Returns: Database['public']['Tables']['playback_states']['Row']
      }
      remove_queue_item: {
        Args: { p_room_id: string; p_actor: string; p_item_id: string }
        Returns: Database['public']['Tables']['queue_items']['Row']
      }
      reorder_queue_item: {
        Args: {
          p_room_id: string
          p_actor: string
          p_item_id: string
          p_after_id: string | null
        }
        /** ★ คืนคิวใหม่ทั้งชุด (เรียงตาม position) ไม่ใช่แค่แถวที่ย้าย */
        Returns: Database['public']['Tables']['queue_items']['Row'][]
      }
      send_chat_message: {
        Args: {
          p_room_id: string
          p_actor: string
          p_text: string
          p_image_url?: string | null
          p_image_width?: number | null
          p_image_height?: number | null
          p_mentions?: { id: string; name: string }[]
          p_reply_to?: {
            id: string
            displayName: string
            text: string
            hasImage: boolean
          } | null
          p_is_sticker?: boolean
        }
        Returns: Database['public']['Tables']['chat_messages']['Row']
      }
      add_room_sticker: {
        Args: {
          p_room_id: string
          p_actor: string
          p_url: string
          p_width?: number | null
          p_height?: number | null
        }
        Returns: Database['public']['Tables']['room_stickers']['Row']
      }
      remove_room_sticker: {
        Args: { p_actor: string; p_sticker_id: string }
        Returns: string
      }
      delete_chat_message: {
        Args: { p_actor: string; p_message_id: string }
        Returns: Database['public']['Tables']['chat_messages']['Row']
      }
      toggle_chat_reaction: {
        Args: { p_actor: string; p_message_id: string; p_emoji: string; p_on: boolean }
        Returns: boolean
      }
      set_member_skip: {
        Args: {
          p_room_id: string
          p_actor: string
          p_target: string
          p_allow: boolean
        }
        Returns: Database['public']['Tables']['room_members']['Row']
      }
      clear_queue: {
        Args: { p_room_id: string; p_actor: string }
        Returns: number
      }
      consume_rate_limit: {
        Args: {
          p_bucket: string
          p_limit: number
          p_window_seconds: number
          p_cost?: number
        }
        Returns: {
          allowed: boolean
          used: number
          limit_value: number
          reset_at: string
        }[]
      }
      reconcile_stale_playback: {
        Args: { p_grace_seconds?: number }
        Returns: number
      }
      prune_ephemeral: {
        Args: { p_search_cache_hours?: number; p_video_cache_days?: number }
        Returns: number
      }
      server_now: {
        Args: Record<string, never>
        Returns: string
      }
      is_room_member: {
        Args: { p_room_id: string }
        Returns: boolean
      }
      my_room_role: {
        Args: { p_room_id: string }
        Returns: MemberRole | null
      }
      set_appearance: {
        Args: { p_actor: string; p_appearance: Record<string, unknown> }
        Returns: void
      }
    }

    Enums: {
      member_role: MemberRole
      queue_status: QueueStatus
    }

    CompositeTypes: Record<never, never>
  }
}

/* ── ทางลัดที่ใช้บ่อยทั่วโปรเจกต์ ─────────────────────────────────────── */

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type ProfileRow = Tables<'profiles'>
export type RoomRow = Tables<'rooms'>
export type ChatMessageRow = Tables<'chat_messages'>
export type RoomStickerRow = Tables<'room_stickers'>
export type RoomMemberRow = Tables<'room_members'>
/**
 * แถวของเกมทายเพลง
 *
 * ★ เขียนมือแทนที่จะประกาศใน Tables เพราะไม่มีที่ไหนอ่านผ่าน .from('quiz_games')
 *   แบบพิมพ์ชื่อคอลัมน์ทีละตัว — มันถูกอ่านทั้งก้อนแล้วแปลงเป็น DTO ที่เดียว
 *   ★★ quiz_rounds ไม่มีชนิดที่นี่โดยตั้งใจ ฝั่ง client ห้ามแตะตารางนั้นเลย
 *      เพราะมันเก็บเฉลย
 */
export type QuizGameRow = {
  id: string
  room_id: string
  host_id: string
  total_rounds: number
  round_idx: number
  status: 'PLAYING' | 'ENDED'
  hint_mask: string | null
  hint_initials: string | null
  hint_channel: string | null
  hint_duration: number | null
  hint_adder: string | null
  round_started_at: string | null
  round_ends_at: string | null
  last_answer: string | null
  last_cover: string | null
  last_winner: string | null
  created_at: string
  ended_at: string | null
}

export type QueueItemRow = Tables<'queue_items'>
export type PlaybackStateRow = Tables<'playback_states'>
