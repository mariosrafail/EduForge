create extension if not exists pgcrypto;

alter table app_users
add column if not exists password_hash text,
add column if not exists last_login_at timestamptz,
add column if not exists auth_provider text default 'password';

update app_users
set auth_provider = 'password'
where auth_provider is null;

create unique index if not exists app_users_email_unique
on app_users (lower(email))
where email is not null and email <> '';

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists auth_sessions_token_hash_idx on auth_sessions (token_hash);
create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id);
