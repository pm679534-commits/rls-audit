// Hand-maintained mirror of supabase/migrations/0001_schema.sql through 0005_seed.sql.
export type Json = string | number | boolean | null | {[key: string]: Json | undefined} | Json[];

type Table<Row extends object, Required extends keyof Row, Generated extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

type PlanId = 'starter' | 'pro' | 'agency';
type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type FindingStatus = 'open' | 'fixed' | 'ignored' | 'accepted';
type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'canceled';
type VerificationMethod = 'dns_txt' | 'meta_tag' | 'well_known_file';
type VerificationStatus = 'pending' | 'verified' | 'failed' | 'expired';
type TeamRole = 'owner' | 'member' | 'viewer';
type UserRole = 'user' | 'admin';
type NotificationType = 'welcome' | 'trial_reminder' | 'trial_expired' | 'scan_completed' | 'finding_alert' | 'score_regression' | 'verification_failed' | 'payment_failed' | 'subscription_changed' | 'system';
type ChannelType = 'slack' | 'discord' | 'webhook';
type SiteStatus = 'active' | 'paused';
type ScanKind = 'automatic' | 'manual' | 'passive' | 'api';
type MessageStatus = 'new' | 'in_progress' | 'resolved' | 'spam';
type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'expired';
type BillingPeriod = 'monthly' | 'annual';
type DomainRuleKind = 'exact' | 'suffix' | 'tld' | 'cidr';

export type Database = {
  public: {
    Tables: {
      plan_entitlements: Table<{
        id: PlanId; site_limit: number; manual_scans_per_month: number | null;
        history_days: number; team_member_limit: number; scan_interval_hours: number;
        features: Json; created_at: string; updated_at: string;
      }, 'id' | 'site_limit' | 'history_days' | 'team_member_limit' | 'scan_interval_hours'>;
      profiles: Table<{
        id: string; email: string; display_name: string | null; avatar_path: string | null;
        role: UserRole; locale: 'en' | 'az'; trial_started_at: string; trial_ends_at: string;
        suspended: boolean; plan_override: PlanId | null; notification_preferences: Json;
        email_unsubscribed_at: string | null; created_at: string; updated_at: string;
      }, 'id' | 'email'>;
      teams: Table<{
        id: string; owner_id: string; name: string; created_at: string; updated_at: string;
      }, 'owner_id' | 'name'>;
      team_members: Table<{
        team_id: string; user_id: string; role: TeamRole; joined_at: string; updated_at: string;
      }, 'team_id' | 'user_id' | 'role'>;
      team_invites: Table<{
        id: string; team_id: string; email: string; role: TeamRole; token_hash: string;
        invited_by: string; expires_at: string; accepted_at: string | null;
        revoked_at: string | null; created_at: string; updated_at: string;
      }, 'team_id' | 'email' | 'role' | 'token_hash' | 'invited_by' | 'expires_at'>;
      client_workspaces: Table<{
        id: string; team_id: string; name: string; client_name: string | null;
        logo_path: string | null; brand_color: string | null; created_at: string; updated_at: string;
      }, 'team_id' | 'name'>;
      sites: Table<{
        id: string; owner_id: string; team_id: string | null; workspace_id: string | null;
        name: string; normalized_url: string; domain: string; status: SiteStatus;
        paused_reason: string | null; verified_at: string | null; verification_due_at: string | null;
        next_scan_at: string | null; last_scan_at: string | null; last_score: number | null;
        scan_interval_hours: number | null; enabled_modules: string[];
        created_at: string; updated_at: string;
      }, 'owner_id' | 'name' | 'normalized_url' | 'domain'>;
      site_verifications: Table<{
        id: string; site_id: string; method: VerificationMethod; challenge_value: string;
        status: VerificationStatus; attempts: number; expires_at: string; checked_at: string | null;
        verified_at: string | null; error_code: string | null; created_at: string; updated_at: string;
      }, 'site_id' | 'method' | 'challenge_value' | 'expires_at'>;
      scans: Table<{
        id: string; site_id: string; requested_by: string | null; kind: ScanKind;
        status: ScanStatus; idempotency_key: string | null; score: number | null;
        summary: Json; started_at: string | null; completed_at: string | null;
        failure_code: string | null; created_at: string; updated_at: string;
      }, 'site_id' | 'kind'>;
      scan_jobs: Table<{
        id: string; scan_id: string; module_key: string; step_key: string;
        status: JobStatus; priority: number; attempts: number; max_attempts: number;
        available_at: string; locked_at: string | null; locked_by: string | null;
        lease_expires_at: string | null; progress: Json; last_error_code: string | null;
        completed_at: string | null; created_at: string; updated_at: string;
      }, 'scan_id' | 'module_key' | 'step_key'>;
      findings: Table<{
        id: string; scan_id: string; site_id: string; finding_key: string;
        fingerprint: string; severity: Severity; score_weight: number;
        affected_asset: string | null; title_key: string; description_key: string;
        impact_key: string; fix_key: string; evidence: Json; fix_snippets: Json;
        metadata: Json; first_seen_at: string; created_at: string; updated_at: string;
      }, 'scan_id' | 'site_id' | 'finding_key' | 'fingerprint' | 'severity' | 'title_key' | 'description_key' | 'impact_key' | 'fix_key'>;
      finding_states: Table<{
        id: string; site_id: string; fingerprint: string; status: FindingStatus;
        reason: string | null; changed_by: string | null; resolved_at: string | null;
        created_at: string; updated_at: string;
      }, 'site_id' | 'fingerprint'>;
      scan_modules_results: Table<{
        id: string; scan_id: string; module_key: string; status: ScanStatus;
        result: Json; error_code: string | null; started_at: string | null;
        completed_at: string | null; created_at: string; updated_at: string;
      }, 'scan_id' | 'module_key'>;
      share_links: Table<{
        id: string; site_id: string; scan_id: string | null; created_by: string | null;
        token_prefix: string; token_hash: string; expires_at: string | null;
        revoked_at: string | null; last_accessed_at: string | null;
        created_at: string; updated_at: string;
      }, 'site_id' | 'token_prefix' | 'token_hash'>;
      api_keys: Table<{
        id: string; owner_id: string; name: string; key_prefix: string; key_hash: string;
        scopes: string[]; last_used_at: string | null; expires_at: string | null;
        revoked_at: string | null; created_at: string; updated_at: string;
      }, 'owner_id' | 'name' | 'key_prefix' | 'key_hash'>;
      encrypted_secrets: Table<{
        id: string; owner_id: string; site_id: string | null; kind: string;
        key_version: number; ciphertext: string; iv: string; tag: string;
        created_at: string; updated_at: string;
      }, 'owner_id' | 'kind' | 'key_version' | 'ciphertext' | 'iv' | 'tag'>;
      subscriptions: Table<{
        id: string; owner_id: string; plan_id: PlanId; status: SubscriptionStatus;
        billing_period: BillingPeriod; paddle_subscription_id: string | null;
        paddle_customer_id: string | null; billing_country: string | null;
        current_period_start: string | null; current_period_end: string | null;
        cancel_at_period_end: boolean; canceled_at: string | null;
        created_at: string; updated_at: string;
      }, 'owner_id' | 'plan_id' | 'status' | 'billing_period'>;
      billing_events: Table<{
        id: string; idempotency_key: string; provider_event_id: string;
        event_type: string; owner_id: string | null; payload: Json;
        processing_error: string | null; processed_at: string | null; processing_started_at: string | null;
        created_at: string; updated_at: string;
      }, 'idempotency_key' | 'provider_event_id' | 'event_type' | 'payload'>;
      notifications: Table<{
        id: string; user_id: string; site_id: string | null; type: NotificationType;
        title_key: string; body_key: string; data: Json; read_at: string | null;
        email_sent_at: string | null; created_at: string; updated_at: string;
      }, 'user_id' | 'type' | 'title_key' | 'body_key'>;
      notification_channels: Table<{
        id: string; owner_id: string; site_id: string | null; type: ChannelType;
        name: string; url_secret_id: string; signing_secret_id: string | null;
        enabled: boolean; last_delivered_at: string | null; last_error_code: string | null;
        created_at: string; updated_at: string;
      }, 'owner_id' | 'type' | 'name' | 'url_secret_id'>;
      notification_deliveries: Table<{
        id: string; notification_id: string; channel_id: string | null;
        destination: 'email' | 'slack' | 'discord' | 'webhook'; status: JobStatus;
        attempts: number; available_at: string; locked_at: string | null;
        last_error_code: string | null; delivered_at: string | null;
        created_at: string; updated_at: string;
      }, 'notification_id' | 'destination'>;
      blocked_domains: Table<{
        id: string; pattern: string; kind: DomainRuleKind; reason: string;
        active: boolean; created_by: string | null; created_at: string; updated_at: string;
      }, 'pattern' | 'kind' | 'reason'>;
      abuse_reports: Table<{
        id: string; reporter_id: string | null; site_id: string | null;
        reporter_email: string | null; target_url: string | null; details: string;
        status: MessageStatus; admin_notes: string | null; created_at: string; updated_at: string;
      }, 'details'>;
      contact_messages: Table<{
        id: string; user_id: string | null; name: string; email: string;
        subject: string; body: string; status: MessageStatus;
        admin_notes: string | null; created_at: string; updated_at: string;
      }, 'name' | 'email' | 'subject' | 'body'>;
      announcements: Table<{
        id: string; title_en: string; title_az: string; body_en: string;
        body_az: string; link_url: string | null; starts_at: string;
        ends_at: string | null; published: boolean; created_by: string | null;
        created_at: string; updated_at: string;
      }, 'title_en' | 'title_az' | 'body_en' | 'body_az'>;
      changelog_entries: Table<{
        id: string; slug: string; title_en: string; title_az: string;
        body_en: string; body_az: string; published_at: string | null;
        created_by: string | null; created_at: string; updated_at: string;
      }, 'slug' | 'title_en' | 'title_az' | 'body_en' | 'body_az'>;
      feature_flags: Table<{
        key: string; enabled: boolean; description: string;
        updated_by: string | null; created_at: string; updated_at: string;
      }, 'key' | 'description'>;
      app_settings: Table<{
        key: string; value: Json; description: string;
        updated_by: string | null; created_at: string; updated_at: string;
      }, 'key' | 'value' | 'description'>;
      admin_audit_log: Table<{
        id: number; actor_id: string | null; action: string;
        target_table: string | null; target_id: string | null; details: Json;
        ip_address: string | null; created_at: string;
      }, 'action', 'id'>;
      rate_limits: Table<{
        key_hash: string; occurred_at: string;
      }, 'key_hash'>;
      disposable_email_domains: Table<{
        domain: string; created_at: string;
      }, 'domain'>;
      trial_claims: Table<{
        email_hash: string; first_claimed_at: string;
      }, 'email_hash'>;
      data_exports: Table<{
        id: string; owner_id: string; format: 'json' | 'csv' | 'pdf'; scope: 'account' | 'sites' | 'findings' | 'scans' | 'report';
        site_id: string | null; scan_id: string | null;
        status: ExportStatus; storage_path: string | null; expires_at: string | null;
        error_code: string | null; completed_at: string | null;
        attempts: number; available_at: string; locked_at: string | null;
        created_at: string; updated_at: string;
      }, 'owner_id' | 'format' | 'scope'>;
    };
    Views: Record<string, never>;
    Functions: {
      set_updated_at: {Args: Record<string, never>; Returns: unknown};
      is_admin: {Args: Record<string, never>; Returns: boolean};
      is_team_member: {Args: {p_team: string}; Returns: boolean};
      can_edit_team: {Args: {p_team: string}; Returns: boolean};
      can_view_site: {Args: {p_site: string}; Returns: boolean};
      can_edit_site: {Args: {p_site: string}; Returns: boolean};
      effective_plan: {Args: {p_user: string}; Returns: PlanId | null};
      current_entitlements: {Args: {p_user: string}; Returns: {
        effective_plan: PlanId | null; is_trial: boolean; read_only: boolean;
        site_limit: number | null; manual_scans_per_month: number | null;
        history_days: number | null; team_member_limit: number | null;
        scan_interval_hours: number | null; features: Json | null;
      }[]};
      active_site_count: {Args: {p_user: string}; Returns: number};
      manual_scan_count_this_month: {Args: {p_user: string}; Returns: number};
      team_seat_count: {Args: {p_team: string}; Returns: number};
      can_add_site: {Args: {p_user: string}; Returns: boolean};
      can_run_manual_scan: {Args: {p_user: string}; Returns: boolean};
      enforce_plan_feature: {Args: Record<string, never>; Returns: unknown};
      enforce_scan_request: {Args: Record<string, never>; Returns: unknown};
      is_blocked_domain: {Args: {p_domain: string}; Returns: boolean};
      enforce_site_limits: {Args: Record<string, never>; Returns: unknown};
      enforce_team_seats: {Args: Record<string, never>; Returns: unknown};
      create_team_owner_member: {Args: Record<string, never>; Returns: unknown};
      protect_team_owner: {Args: Record<string, never>; Returns: unknown};
      protect_owner_membership: {Args: Record<string, never>; Returns: unknown};
      protect_profile_privileges: {Args: Record<string, never>; Returns: unknown};
      handle_new_user: {Args: Record<string, never>; Returns: unknown};
      handle_auth_email_change: {Args: Record<string, never>; Returns: unknown};
      sync_site_limit: {Args: {p_user: string}; Returns: number};
      sync_plan_access: {Args: {p_user: string}; Returns: undefined};
      on_entitlement_change: {Args: Record<string, never>; Returns: unknown};
      on_profile_entitlement_change: {Args: Record<string, never>; Returns: unknown};
      rate_limit_check: {Args: {p_key: string; p_limit: number; p_window: string}; Returns: boolean};
      claim_scan_jobs: {Args: {p_limit: number; p_worker: string; p_lease_seconds?: number}; Returns: Database['public']['Tables']['scan_jobs']['Row'][]};
      recover_stuck_jobs: {Args: {p_limit?: number}; Returns: number};
      start_scan: {Args: {p_site: string; p_kind: ScanKind; p_requester: string | null; p_idempotency?: string | null; p_priority?: number}; Returns: Database['public']['Tables']['scans']['Row']};
      enqueue_due_scans: {Args: {p_limit?: number}; Returns: number};
      purge_expired_scan_history: {Args: {p_limit?: number}; Returns: number};
      queue_notification_delivery: {Args: Record<string, never>; Returns: unknown};
      notify_completed_scan: {Args: Record<string, never>; Returns: unknown};
      notify_subscription_change: {Args: Record<string, never>; Returns: unknown};
      claim_notification_deliveries: {Args: {p_limit?: number}; Returns: Database['public']['Tables']['notification_deliveries']['Row'][]};
      claim_data_exports: {Args: {p_limit?: number}; Returns: Database['public']['Tables']['data_exports']['Row'][]};
      enqueue_trial_notifications: {Args: {p_limit?: number}; Returns: number};
      list_my_sessions: {Args: Record<string, never>; Returns: {session_id: string; created_at: string; updated_at: string}[]};
      maintenance_enabled: {Args: Record<string, never>; Returns: boolean};
      admin_dashboard_metrics: {Args: {p_days?: number}; Returns: Json};
      admin_requeue_scan: {Args: {p_scan: string}; Returns: number};
      admin_cancel_scan: {Args: {p_scan: string}; Returns: number};
    };
    Enums: {
      plan_id: PlanId; subscription_status: SubscriptionStatus; severity: Severity;
      finding_status: FindingStatus; scan_status: ScanStatus; job_status: JobStatus;
      verification_method: VerificationMethod; verification_status: VerificationStatus;
      team_role: TeamRole; user_role: UserRole; notification_type: NotificationType;
      channel_type: ChannelType; site_status: SiteStatus; scan_kind: ScanKind;
      message_status: MessageStatus; export_status: ExportStatus;
      billing_period: BillingPeriod; domain_rule_kind: DomainRuleKind;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
