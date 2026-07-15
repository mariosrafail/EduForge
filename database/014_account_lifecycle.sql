alter table app_users
  add column if not exists password_set_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists invited_by uuid references app_users(id) on delete set null,
  add column if not exists invitation_accepted_at timestamptz;

update app_users
set password_set_at = coalesce(password_set_at, created_at, now())
where password_hash is not null and password_set_at is null;

create table if not exists account_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  purpose text not null check (purpose in ('initial_password', 'password_reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  delivery_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (used_at is null or revoked_at is null)
);

create unique index if not exists account_tokens_one_active_per_purpose
  on account_tokens (user_id, purpose)
  where used_at is null and revoked_at is null;
create index if not exists account_tokens_active_expiry_idx
  on account_tokens (expires_at) where used_at is null and revoked_at is null;
create index if not exists account_tokens_creator_idx on account_tokens (created_by);

create table if not exists account_email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  created_by uuid references app_users(id) on delete set null,
  recipient_email text not null,
  template_type text not null check (template_type in ('account_invitation', 'password_reset', 'password_changed')),
  template_variables jsonb not null default '{}'::jsonb,
  delivery_state text not null default 'queued' check (delivery_state in ('queued', 'captured', 'preview', 'provider_required', 'sent', 'failed')),
  provider_reference text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists account_email_outbox_state_idx on account_email_outbox (delivery_state, created_at);
create index if not exists account_email_outbox_user_idx on account_email_outbox (user_id);

create table if not exists account_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  actor_user_id uuid references app_users(id) on delete set null,
  school_id uuid references schools(id) on delete cascade,
  event_type text not null,
  request_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_security_events_user_idx on account_security_events (user_id, created_at desc);
create index if not exists account_security_events_school_idx on account_security_events (school_id, created_at desc);

create table if not exists account_rate_limit_attempts (
  id bigserial primary key,
  scope text not null check (scope in ('forgot_password', 'invitation_resend', 'token_validation')),
  request_fingerprint text not null,
  email_hash text,
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists account_rate_limit_scope_fingerprint_idx
  on account_rate_limit_attempts (scope, request_fingerprint, attempted_at desc);
create index if not exists account_rate_limit_scope_email_idx
  on account_rate_limit_attempts (scope, email_hash, attempted_at desc) where email_hash is not null;
