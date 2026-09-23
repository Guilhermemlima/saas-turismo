// Mirrors supabase/migrations. Regenerate with `npm run db:types` once a Supabase project is linked;
// until then keep this file in sync by hand whenever a migration changes.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type AgencyRole = "owner" | "manager" | "consultant" | "attendant" | "financial";
export type AgencyStatus = "trial" | "active" | "suspended" | "cancelled";
export type MemberStatus = "invited" | "active" | "disabled";
export type ActorType = "user" | "ai" | "system" | "webhook" | "platform_admin";
export type CustomerSource = "whatsapp" | "manual" | "import" | "referral" | "instagram" | "website" | "other";

type ProfileRow = { id: string; full_name: string; avatar_url: string | null } & Timestamps;

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
} & Timestamps;

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
    };
    Enums: {
      agency_role: AgencyRole;
      agency_status: AgencyStatus;
      member_status: MemberStatus;
      actor_type: ActorType;
      customer_source: CustomerSource;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
