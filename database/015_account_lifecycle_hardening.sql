alter table account_email_outbox
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists claim_id uuid,
  add column if not exists claimed_at timestamptz;

alter table account_email_outbox
  drop constraint if exists account_email_outbox_delivery_state_check;
alter table account_email_outbox
  add constraint account_email_outbox_delivery_state_check
  check (delivery_state in ('queued', 'sending', 'captured', 'preview', 'sent', 'failed', 'retryable', 'exhausted'));

alter table account_security_events
  drop constraint if exists account_security_events_school_id_fkey;
alter table account_security_events
  add constraint account_security_events_school_id_fkey
  foreign key (school_id) references schools(id) on delete set null;

create index if not exists account_tokens_hash_purpose_idx
  on account_tokens (token_hash, purpose);
create index if not exists account_email_outbox_dispatch_idx
  on account_email_outbox (next_attempt_at, created_at)
  where delivery_state in ('queued', 'retryable');
create index if not exists account_email_outbox_claim_idx
  on account_email_outbox (claim_id) where claim_id is not null;
create index if not exists account_rate_limit_retention_idx
  on account_rate_limit_attempts (attempted_at);

create or replace function revoke_account_sessions(target_user_id uuid)
returns bigint
language sql
volatile
as $$
  with removed as (delete from auth_sessions where user_id = target_user_id returning id)
  select count(*)::bigint from removed;
$$;

create or replace function cleanup_account_lifecycle_history(
  rate_limit_retention interval default interval '7 days',
  expired_token_retention interval default interval '30 days'
) returns table(rate_limit_rows bigint, token_rows bigint)
language plpgsql
as $$
begin
  delete from account_rate_limit_attempts where attempted_at < now() - rate_limit_retention;
  get diagnostics rate_limit_rows = row_count;
  delete from account_tokens
  where expires_at < now() - expired_token_retention
    and (used_at is not null or revoked_at is not null or expires_at < now());
  get diagnostics token_rows = row_count;
  return next;
end;
$$;
