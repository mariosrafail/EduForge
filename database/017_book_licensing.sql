-- Production-oriented one-time book licensing. Evolves the existing activation_codes/book_access model.

create table if not exists activation_code_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  book_package_id uuid not null references book_packages(id) on delete restrict,
  request_key uuid not null,
  label text,
  quantity int not null check (quantity between 1 and 500),
  expires_at timestamptz,
  initial_exported_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, request_key),
  unique (id, book_package_id, school_id),
  check (label is null or char_length(label) between 1 and 120),
  check (expires_at is null or expires_at > created_at)
);

alter table activation_codes drop constraint if exists activation_codes_status_check;
alter table activation_codes alter column code drop not null;
alter table activation_codes
  add column if not exists code_hash text,
  add column if not exists code_mask text,
  add column if not exists batch_id uuid,
  add column if not exists redeemed_at timestamptz,
  add column if not exists redeemed_by uuid references app_users(id) on delete restrict,
  add column if not exists revoked_at timestamptz,
  add column if not exists revocation_reason text,
  add column if not exists created_by uuid references app_users(id) on delete set null;

update activation_codes
set code_hash = encode(sha256(convert_to(upper(regexp_replace(trim(code), '[^a-zA-Z0-9]', '', 'g')), 'UTF8')), 'hex'),
    code_mask = '••••-' || right(upper(regexp_replace(trim(code), '[^a-zA-Z0-9]', '', 'g')), 4)
where code_hash is null and code is not null;

-- Preserve migration availability if legacy codes differed only by formatting.
-- Duplicate normalized values are permanently revoked and assigned non-redeemable hashes.
with normalized_duplicates as (
  select id, row_number() over (partition by code_hash order by created_at, id) as duplicate_number
  from activation_codes
)
update activation_codes ac
set code_hash = encode(sha256(convert_to(ac.code_hash || ':' || ac.id::text, 'UTF8')), 'hex'),
    status = 'revoked',
    revoked_at = coalesce(ac.revoked_at, now()),
    revocation_reason = 'Legacy normalized-code collision revoked during licensing migration'
from normalized_duplicates duplicate
where duplicate.id = ac.id and duplicate.duplicate_number > 1;

with unique_redemptions as (
  select activation_code_id, min(user_id::text)::uuid as user_id
  from book_access
  where activation_code_id is not null
  group by activation_code_id
  having count(distinct user_id) = 1
)
update activation_codes ac
set redeemed_by = r.user_id,
    redeemed_at = coalesce(ac.updated_at, ac.created_at, now())
from unique_redemptions r
where ac.id = r.activation_code_id and ac.redeemed_by is null;

update activation_codes
set status = case
      when expires_at is not null and expires_at <= now() then 'expired'
      when status = 'revoked' then 'revoked'
      when redeemed_by is not null then 'redeemed'
      else 'unused'
    end,
    revoked_at = case when status = 'revoked' then coalesce(revoked_at, updated_at, now()) else revoked_at end,
    revocation_reason = case
      when status = 'revoked' then coalesce(revocation_reason, 'Legacy code revoked before licensing migration')
      when used_count > 0 and redeemed_by is null then 'Legacy multi-user code cannot be converted to one-time licensing'
      else revocation_reason
    end;

update activation_codes
set status = 'revoked', revoked_at = coalesce(revoked_at, now())
where used_count > 0 and redeemed_by is null and status <> 'expired';

update activation_codes set code = null where code is not null;

alter table activation_codes
  add constraint activation_codes_lifecycle_status_check check (status in ('unused', 'redeemed', 'revoked', 'expired')),
  add constraint activation_codes_hash_check check (code_hash ~ '^[a-f0-9]{64}$'),
  add constraint activation_codes_mask_check check (char_length(code_mask) between 5 and 24),
  add constraint activation_codes_redeemed_state_check check (
    status <> 'redeemed' or (redeemed_by is not null and redeemed_at is not null)
  ),
  add constraint activation_codes_revoked_state_check check (
    status <> 'revoked' or revoked_at is not null
  ),
  add constraint activation_codes_batch_scope_fk foreign key (batch_id, book_package_id, school_id)
    references activation_code_batches(id, book_package_id, school_id) on delete cascade;

alter table activation_codes alter column code_hash set not null;
alter table activation_codes alter column code_mask set not null;

create unique index if not exists activation_codes_code_hash_unique_idx on activation_codes(code_hash);
create index if not exists activation_code_batches_school_created_idx on activation_code_batches(school_id, created_at desc);
create index if not exists activation_codes_batch_status_idx on activation_codes(batch_id, status, created_at);
create index if not exists activation_codes_redeemed_by_idx on activation_codes(redeemed_by, redeemed_at desc) where redeemed_by is not null;

create table if not exists book_code_redemption_attempts (
  id bigserial primary key,
  school_id uuid references schools(id) on delete cascade,
  user_id uuid references app_users(id) on delete cascade,
  request_fingerprint text not null,
  code_hash text not null,
  succeeded boolean not null default false,
  failure_code text,
  attempted_at timestamptz not null default now(),
  check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  check (code_hash ~ '^[a-f0-9]{64}$'),
  check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,64}$')
);

create index if not exists book_code_redemption_attempts_window_idx
  on book_code_redemption_attempts(request_fingerprint, attempted_at desc);
create index if not exists book_code_redemption_attempts_user_window_idx
  on book_code_redemption_attempts(user_id, attempted_at desc);

create table if not exists book_license_audit_events (
  id bigserial primary key,
  school_id uuid not null references schools(id) on delete cascade,
  actor_user_id uuid references app_users(id) on delete set null,
  batch_id uuid references activation_code_batches(id) on delete set null,
  code_id uuid references activation_codes(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z0-9_]{3,64}$'),
  succeeded boolean not null default true,
  failure_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,64}$')
);

create index if not exists book_license_audit_events_school_created_idx
  on book_license_audit_events(school_id, created_at desc);
create index if not exists book_license_audit_events_batch_idx
  on book_license_audit_events(batch_id, created_at desc) where batch_id is not null;
