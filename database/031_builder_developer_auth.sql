-- Dedicated publisher Builder developer identity plane.
-- Builder developers intentionally do not belong to app_users, schools, or platform_admins.

create extension if not exists pgcrypto;

create table if not exists builder_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  email text not null check (email = lower(trim(email))),
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  role text not null default 'developer' check (role = 'developer'),
  last_login_at timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists builder_users_email_unique_idx on builder_users(lower(email));
create index if not exists builder_users_status_idx on builder_users(status);

create table if not exists builder_sessions (
  id uuid primary key default gen_random_uuid(),
  builder_user_id uuid not null references builder_users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  request_fingerprint text,
  user_agent_hash text,
  check (expires_at > created_at)
);
create index if not exists builder_sessions_user_idx on builder_sessions(builder_user_id, expires_at desc);
create index if not exists builder_sessions_active_idx on builder_sessions(token_hash, expires_at) where revoked_at is null;

create table if not exists builder_login_attempts (
  id bigint generated always as identity primary key,
  builder_user_id uuid references builder_users(id) on delete set null,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  succeeded boolean not null default false,
  outcome text not null default 'pending'
    check (outcome in ('pending', 'invalid_credentials', 'authenticated', 'rejected_account', 'rate_limited')),
  attempted_at timestamptz not null default now()
);
create index if not exists builder_login_attempts_source_failure_idx
  on builder_login_attempts(request_fingerprint, attempted_at) where outcome = 'invalid_credentials';
create index if not exists builder_login_attempts_email_failure_idx
  on builder_login_attempts(email_hash, attempted_at) where outcome = 'invalid_credentials';
create index if not exists builder_login_attempts_pair_failure_idx
  on builder_login_attempts(request_fingerprint, email_hash, attempted_at) where outcome = 'invalid_credentials';
create index if not exists builder_login_attempts_email_success_idx
  on builder_login_attempts(email_hash, attempted_at desc) where outcome = 'authenticated';
create index if not exists builder_login_attempts_pending_idx
  on builder_login_attempts(request_fingerprint, email_hash, attempted_at) where outcome = 'pending';
create index if not exists builder_login_attempts_retention_idx on builder_login_attempts(attempted_at);

create table if not exists builder_audit_log (
  id bigint generated always as identity primary key,
  builder_user_id uuid references builder_users(id) on delete set null,
  action text not null check (action ~ '^[a-z0-9_]{3,80}$'),
  target_type text not null check (target_type ~ '^[a-z0-9_]{2,80}$'),
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object'),
  check (not (metadata ?| array[
    'password','password_hash','session_token','token','database_url',
    'answers','teacher_solutions','secret','secrets'
  ]))
);
create index if not exists builder_audit_recent_idx on builder_audit_log(created_at desc);
create index if not exists builder_audit_actor_idx on builder_audit_log(builder_user_id, created_at desc);
create index if not exists builder_audit_target_idx on builder_audit_log(target_type, target_id, created_at desc);

create or replace function revoke_builder_sessions(user_id uuid)
returns integer
language plpgsql
as $$
declare affected integer;
begin
  update builder_sessions
  set revoked_at = coalesce(revoked_at, now())
  where builder_user_id = user_id and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function set_builder_user_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists builder_users_updated_at on builder_users;
create trigger builder_users_updated_at
before update on builder_users
for each row execute function set_builder_user_updated_at();
