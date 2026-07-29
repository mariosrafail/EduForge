-- Distributed, privacy-preserving limiter state for ordinary LMS authentication.

create table if not exists auth_login_attempts (
  id bigint generated always as identity primary key,
  user_id uuid references app_users(id) on delete set null,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  outcome text not null check (
    outcome in ('pending', 'invalid_credentials', 'authenticated', 'inactive_account', 'rate_limited')
  ),
  attempted_at timestamptz not null default statement_timestamp()
);

create index if not exists auth_login_attempts_source_failure_idx
  on auth_login_attempts (request_fingerprint, attempted_at)
  where outcome = 'invalid_credentials';

create index if not exists auth_login_attempts_email_failure_idx
  on auth_login_attempts (email_hash, attempted_at)
  where outcome = 'invalid_credentials';

create index if not exists auth_login_attempts_pair_failure_idx
  on auth_login_attempts (request_fingerprint, email_hash, attempted_at)
  where outcome = 'invalid_credentials';

create index if not exists auth_login_attempts_email_success_idx
  on auth_login_attempts (email_hash, attempted_at desc)
  where outcome = 'authenticated';

create index if not exists auth_login_attempts_pending_idx
  on auth_login_attempts (request_fingerprint, email_hash, attempted_at)
  where outcome = 'pending';

create index if not exists auth_login_attempts_retention_idx
  on auth_login_attempts (attempted_at);
