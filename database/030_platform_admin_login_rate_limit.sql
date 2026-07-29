-- Distributed Platform Admin limiter outcomes and dimension-specific indexes.

alter table platform_admin_login_attempts
  add column if not exists outcome text;

update platform_admin_login_attempts
set outcome = case when succeeded then 'authenticated' else 'invalid_credentials' end
where outcome is null;

alter table platform_admin_login_attempts
  alter column outcome set default 'pending',
  alter column outcome set not null;

alter table platform_admin_login_attempts
  drop constraint if exists platform_admin_login_attempts_outcome_check;

alter table platform_admin_login_attempts
  add constraint platform_admin_login_attempts_outcome_check
  check (outcome in ('pending', 'invalid_credentials', 'authenticated', 'rejected_account', 'rate_limited'));

create index if not exists platform_admin_login_attempts_source_failure_idx
  on platform_admin_login_attempts(request_fingerprint, attempted_at)
  where outcome = 'invalid_credentials';

create index if not exists platform_admin_login_attempts_email_failure_idx
  on platform_admin_login_attempts(email_hash, attempted_at)
  where outcome = 'invalid_credentials';

create index if not exists platform_admin_login_attempts_pair_failure_idx
  on platform_admin_login_attempts(request_fingerprint, email_hash, attempted_at)
  where outcome = 'invalid_credentials';

create index if not exists platform_admin_login_attempts_email_success_idx
  on platform_admin_login_attempts(email_hash, attempted_at desc)
  where outcome = 'authenticated';

create index if not exists platform_admin_login_attempts_pending_idx
  on platform_admin_login_attempts(request_fingerprint, email_hash, attempted_at)
  where outcome = 'pending';

create index if not exists platform_admin_login_attempts_retention_idx
  on platform_admin_login_attempts(attempted_at);
