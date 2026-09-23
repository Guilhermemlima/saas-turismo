// Mirrors supabase/migrations. Regenerate with `npm run db:types` once a Supabase project is linked;
// until then keep this file in sync by hand whenever a migration changes.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type AgencyRole = "owner" | "manager" | "consultant" | "attendant" | "financial";
export type AgencyStatus = "trial" | "active" | "suspended" | "cancelled";
export type MemberStatus = "invited" | "active" | "disabled";
export type ActorType = "user" | "ai" | "system" | "webhook" | "platform_admin";
export type CustomerSource = "whatsapp" | "manual" | "import" | "referral" | "instagram" | "website" | "other";
export type TripScope = "national" | "international";
export type TripType =
  | "leisure"
  | "honeymoon"
  | "family"
  | "couple"
  | "solo"
  | "corporate"
  | "cruise"
  | "disney"
  | "exchange"
  | "excursion"
  | "package"
  | "custom";
export type TravelRequestStatus = "collecting" | "complete" | "archived" | "cancelled";
export type DateFlexibility = "exact" | "flexible_days" | "month_only" | "undecided";
export type MealPlan = "room_only" | "breakfast" | "half_board" | "full_board" | "all_inclusive";
export type BudgetScope = "total" | "per_person";
export type StageKey =
  | "new_contact"
  | "qualifying"
  | "request_complete"
  | "quoting"
  | "quote_ready"
  | "proposal_sent"
  | "followup"
  | "negotiation"
  | "booking"
  | "payment"
  | "confirmed"
  | "post_sale"
  | "lost";

export type ChannelType = "whatsapp" | "simulator";
export type ChannelStatus = "pending" | "connected" | "disconnected" | "error";
export type ConversationMode = "ai" | "human";
export type ConversationStatus = "open" | "pending" | "closed";
export type MessageDirection = "inbound" | "outbound";
export type MessageSender = "customer" | "ai" | "human" | "system";
export type MessageStatus = "received" | "queued" | "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageKind = "text" | "image" | "audio" | "video" | "document" | "location" | "interactive" | "template" | "reaction" | "unsupported";
export type NotificationType =
  | "hot_lead"
  | "new_request"
  | "quote_needed"
  | "proposal_viewed"
  | "customer_replied"
  | "proposal_accepted"
  | "trip_upcoming"
  | "followup_overdue"
  | "handoff_requested"
  | "system";

type ChannelRow = {
  id: string;
  agency_id: string;
  type: ChannelType;
  status: ChannelStatus;
  display_name: string;
  phone_e164: string | null;
  wa_phone_number_id: string | null;
  connected_at: string | null;
  last_error: string | null;
} & Timestamps;

type ConversationRow = {
  id: string;
  agency_id: string;
  channel_id: string;
  customer_id: string;
  status: ConversationStatus;
  mode: ConversationMode;
  assigned_member_id: string | null;
  is_simulation: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  summary: string | null;
  handoff_reason: string | null;
  handoff_at: string | null;
  closed_at: string | null;
} & Timestamps;

type MessageRow = {
  id: string;
  agency_id: string;
  conversation_id: string;
  channel_id: string;
  direction: MessageDirection;
  sender: MessageSender;
  sender_user_id: string | null;
  kind: MessageKind;
  body: string | null;
  media: Json | null;
  external_message_id: string | null;
  status: MessageStatus;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
};

type NotificationRow = {
  id: string;
  agency_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

type ProfileRow = { id: string; full_name: string; email: string | null; avatar_url: string | null } & Timestamps;

type AgencyRow = {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  phone_e164: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  logo_path: string | null;
  city: string | null;
  state: string | null;
  country: string;
  status: AgencyStatus;
  onboarding_completed_steps: number[];
  onboarding_completed_at: string | null;
  specialties: TripType[];
  specialty_scopes: TripScope[];
} & Timestamps;

type AgencyInvitationRow = {
  id: string;
  agency_id: string;
  email: string;
  role: AgencyRole;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  created_at: string;
};

type AgencySettingsRow = {
  agency_id: string;
  timezone: string;
  currency: string;
  business_hours: Json;
  temperature_thresholds: Json;
  consultant_visibility: "all" | "own";
  updated_at: string;
};

type AgencyMemberRow = {
  id: string;
  agency_id: string;
  user_id: string;
  role: AgencyRole;
  status: MemberStatus;
  display_name: string | null;
} & Timestamps;

type AuditLogRow = {
  id: number;
  agency_id: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
};

type CustomerRow = {
  id: string;
  agency_id: string;
  full_name: string;
  phone_e164: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  country: string;
  birth_date: string | null;
  source: CustomerSource;
  owner_member_id: string | null;
  notes: string | null;
  marketing_opt_in: boolean;
  last_contact_at: string | null;
  archived_at: string | null;
  anonymized_at: string | null;
  created_by: string | null;
} & Timestamps;

type PipelineRow = { id: string; agency_id: string; name: string; is_default: boolean } & Timestamps;

type PipelineStageRow = {
  id: string;
  agency_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
  system_key: StageKey | null;
  is_won: boolean;
  is_lost: boolean;
  archived_at: string | null;
} & Timestamps;

type DealRow = {
  id: string;
  agency_id: string;
  customer_id: string;
  pipeline_id: string;
  stage_id: string;
  stage_entered_at: string;
  assigned_member_id: string | null;
  title: string;
  expected_value_cents: number | null;
  currency: string;
  lead_score: number;
  lost_reason: string | null;
  won_at: string | null;
  lost_at: string | null;
  archived_at: string | null;
  created_by: string | null;
} & Timestamps;

type DealStageHistoryRow = {
  id: number;
  agency_id: string;
  deal_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string | null;
  changed_at: string;
};

type TravelRequestRow = {
  id: string;
  agency_id: string;
  deal_id: string;
  customer_id: string;
  status: TravelRequestStatus;
  origin_city: string | null;
  destination: string | null;
  trip_scope: TripScope | null;
  trip_types: TripType[];
  date_flexibility: DateFlexibility;
  departure_date: string | null;
  return_date: string | null;
  travel_month: string | null;
  nights: number | null;
  adults: number | null;
  children_ages: number[];
  children: number;
  infants: number;
  budget_cents: number | null;
  budget_currency: string;
  budget_scope: BudgetScope | null;
  needs_flights: boolean;
  needs_hotel: boolean;
  needs_transfer: boolean;
  needs_insurance: boolean;
  needs_tours: boolean;
  hotel_category: number | null;
  rooms: number | null;
  meal_plan: MealPlan | null;
  special_requests: string | null;
  notes: string | null;
  completed_at: string | null;
  created_by: string | null;
} & Timestamps;

type Fk<Name extends string, Cols extends string[], Ref extends string, RefCols extends string[]> = {
  foreignKeyName: Name;
  columns: Cols;
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: RefCols;
};

/** Columns with defaults (or nullable) become optional on insert. */
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Omit<Row, Required>>;

type Table<Row, Required extends keyof Row, Relationships extends unknown[] = []> = {
  Row: Row;
  Insert: Insertable<Row, Required>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      agencies: Table<AgencyRow, "name" | "slug">;
      agency_settings: Table<AgencySettingsRow, "agency_id">;
      agency_members: Table<
        AgencyMemberRow,
        "agency_id" | "user_id" | "role",
        [
          {
            foreignKeyName: "agency_members_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agency_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ]
      >;
      platform_admins: Table<{ user_id: string; created_at: string }, "user_id">;
      audit_logs: Table<AuditLogRow, "actor_type" | "action">;
      customers: Table<
        CustomerRow,
        "agency_id" | "full_name",
        [
          {
            foreignKeyName: "customers_owner_member_fk";
            columns: ["agency_id", "owner_member_id"];
            isOneToOne: false;
            referencedRelation: "agency_members";
            referencedColumns: ["agency_id", "id"];
          },
        ]
      >;
      agency_invitations: Table<AgencyInvitationRow, "agency_id" | "email" | "role" | "token_hash" | "invited_by">;
      channels: Table<ChannelRow, "agency_id" | "type" | "display_name">;
      conversations: Table<
        ConversationRow,
        "agency_id" | "channel_id" | "customer_id",
        [
          Fk<"conversations_customer_fk", ["agency_id", "customer_id"], "customers", ["agency_id", "id"]>,
          Fk<"conversations_channel_fk", ["agency_id", "channel_id"], "channels", ["agency_id", "id"]>,
          Fk<"conversations_assigned_member_fk", ["agency_id", "assigned_member_id"], "agency_members", ["agency_id", "id"]>,
        ]
      >;
      messages: Table<
        MessageRow,
        "agency_id" | "conversation_id" | "channel_id" | "direction" | "sender" | "status",
        [Fk<"messages_conversation_fk", ["agency_id", "conversation_id"], "conversations", ["agency_id", "id"]>]
      >;
      notifications: Table<NotificationRow, "agency_id" | "user_id" | "type" | "title">;
      pipelines: Table<PipelineRow, "agency_id" | "name">;
      pipeline_stages: Table<
        PipelineStageRow,
        "agency_id" | "pipeline_id" | "name" | "position",
        [Fk<"pipeline_stages_pipeline_fk", ["agency_id", "pipeline_id"], "pipelines", ["agency_id", "id"]>]
      >;
      deals: Table<
        DealRow,
        "agency_id" | "customer_id" | "pipeline_id" | "stage_id" | "title",
        [
          Fk<"deals_customer_fk", ["agency_id", "customer_id"], "customers", ["agency_id", "id"]>,
          Fk<"deals_stage_fk", ["agency_id", "stage_id"], "pipeline_stages", ["agency_id", "id"]>,
          Fk<"deals_pipeline_fk", ["agency_id", "pipeline_id"], "pipelines", ["agency_id", "id"]>,
          Fk<"deals_assigned_member_fk", ["agency_id", "assigned_member_id"], "agency_members", ["agency_id", "id"]>,
        ]
      >;
      deal_stage_history: Table<
        DealStageHistoryRow,
        "agency_id" | "deal_id" | "to_stage_id",
        [Fk<"deal_stage_history_deal_fk", ["agency_id", "deal_id"], "deals", ["agency_id", "id"]>]
      >;
      travel_requests: Table<
        TravelRequestRow,
        "agency_id" | "deal_id" | "customer_id",
        [
          Fk<"travel_requests_deal_fk", ["agency_id", "deal_id"], "deals", ["agency_id", "id"]>,
          Fk<"travel_requests_customer_fk", ["agency_id", "customer_id"], "customers", ["agency_id", "id"]>,
        ]
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_agency_with_owner: {
        Args: {
          p_name: string;
          p_phone_e164?: string | null;
          p_email?: string | null;
          p_city?: string | null;
          p_state?: string | null;
        };
        Returns: string;
      };
      get_invitation: {
        Args: { p_token_hash: string };
        Returns: { agency_name: string; role: AgencyRole; email: string; status: "pending" | "accepted" | "expired" | "revoked" }[];
      };
      start_simulated_conversation: { Args: { p_customer_id: string }; Returns: string };
      post_conversation_message: { Args: { p_conversation_id: string; p_body: string; p_as_customer?: boolean }; Returns: string };
      accept_invitation: { Args: { p_token_hash: string }; Returns: string };
      mark_onboarding_step: { Args: { p_agency: string; p_step: number }; Returns: undefined };
      create_travel_request: {
        Args: {
          p_customer_id: string;
          p_title: string;
          p_stage_key: StageKey;
          p_assigned_member_id: string | null;
          p_request: Json;
        };
        Returns: { deal_id: string; travel_request_id: string }[];
      };
    };
    Enums: {
      agency_role: AgencyRole;
      agency_status: AgencyStatus;
      member_status: MemberStatus;
      actor_type: ActorType;
      customer_source: CustomerSource;
      trip_scope: TripScope;
      trip_type: TripType;
      travel_request_status: TravelRequestStatus;
      date_flexibility: DateFlexibility;
      meal_plan: MealPlan;
      budget_scope: BudgetScope;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
