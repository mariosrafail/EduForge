-- Dedicated cross-tenant Platform Administration control plane.
-- Platform administrators intentionally do not belong to app_users or schools.

create extension if not exists pgcrypto;

alter table schools add column if not exists status text not null default 'active';
do $$ begin
  alter table schools add constraint schools_platform_status_check check (status in ('active', 'paused'));
exception when duplicate_object then null; end $$;
create index if not exists schools_status_created_idx on schools(status, created_at desc);

create table if not exists platform_admins (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  email text not null check (email = lower(trim(email))),
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  last_login_at timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists platform_admins_email_unique_idx on platform_admins(lower(email));
create index if not exists platform_admins_status_idx on platform_admins(status);

create table if not exists platform_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_admin_id uuid not null references platform_admins(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  request_fingerprint text,
  user_agent_hash text,
  check (expires_at > created_at)
);
create index if not exists platform_admin_sessions_admin_idx on platform_admin_sessions(platform_admin_id, expires_at desc);
create index if not exists platform_admin_sessions_active_idx on platform_admin_sessions(token_hash, expires_at) where revoked_at is null;

create table if not exists platform_admin_audit_log (
  id bigint generated always as identity primary key,
  platform_admin_id uuid references platform_admins(id) on delete set null,
  action text not null check (action ~ '^[a-z0-9_]{3,80}$'),
  target_type text not null check (target_type ~ '^[a-z0-9_]{2,80}$'),
  target_id text,
  target_school_id uuid references schools(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object'),
  check (not (metadata ?| array['password','password_hash','session_token','token','database_url','answers','teacher_solutions']))
);
create index if not exists platform_admin_audit_recent_idx on platform_admin_audit_log(created_at desc);
create index if not exists platform_admin_audit_actor_idx on platform_admin_audit_log(platform_admin_id, created_at desc);
create index if not exists platform_admin_audit_target_idx on platform_admin_audit_log(target_type, target_id, created_at desc);
create index if not exists platform_admin_audit_school_idx on platform_admin_audit_log(target_school_id, created_at desc);

create table if not exists platform_admin_login_attempts (
  id bigint generated always as identity primary key,
  platform_admin_id uuid references platform_admins(id) on delete set null,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index if not exists platform_admin_login_attempts_fingerprint_idx
  on platform_admin_login_attempts(request_fingerprint, attempted_at desc);
create index if not exists platform_admin_login_attempts_email_idx
  on platform_admin_login_attempts(email_hash, attempted_at desc);

create or replace function revoke_platform_admin_sessions(admin_id uuid)
returns integer
language plpgsql
as $$
declare affected integer;
begin
  update platform_admin_sessions
  set revoked_at = coalesce(revoked_at, now())
  where platform_admin_id = admin_id and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function set_platform_admin_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists platform_admins_updated_at on platform_admins;
create trigger platform_admins_updated_at
before update on platform_admins
for each row execute function set_platform_admin_updated_at();
