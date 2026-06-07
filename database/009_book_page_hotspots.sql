create extension if not exists pgcrypto;

create table if not exists book_page_hotspots (
  id uuid primary key default gen_random_uuid(),
  package_slug text not null,
  component_slug text not null,
  page_id text not null,
  page_number integer null,
  label text not null default 'Clickable area',
  left_percent numeric(7,4) not null,
  top_percent numeric(7,4) not null,
  width_percent numeric(7,4) not null,
  height_percent numeric(7,4) not null,
  action_type text not null default 'none',
  action_target_id uuid null,
  action_payload jsonb not null default '{}'::jsonb,
  created_by uuid null references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_page_hotspots_bounds_check check (
    left_percent >= 0
    and top_percent >= 0
    and width_percent > 0
    and height_percent > 0
    and left_percent + width_percent <= 100
    and top_percent + height_percent <= 100
  )
);

create index if not exists book_page_hotspots_page_idx
  on book_page_hotspots (package_slug, component_slug, page_id);

create index if not exists book_page_hotspots_page_number_idx
  on book_page_hotspots (package_slug, component_slug, page_number)
  where page_number is not null;

alter table book_page_hotspots
  add column if not exists action_target_id uuid null;

create index if not exists book_page_hotspots_action_target_idx
  on book_page_hotspots (action_target_id);

create index if not exists book_page_hotspots_component_idx
  on book_page_hotspots (package_slug, component_slug);

create table if not exists book_media_assets (
  id uuid primary key default gen_random_uuid(),
  package_slug text not null,
  component_slug text not null,
  page_id text null,
  file_name text not null,
  original_file_name text null,
  mime_type text not null,
  file_size_bytes bigint null,
  public_url text not null,
  storage_path text null,
  kind text not null,
  created_by uuid null references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint book_media_assets_kind_check check (kind in ('video', 'audio', 'image', 'document', 'other'))
);

create index if not exists book_media_assets_context_idx
  on book_media_assets (package_slug, component_slug, page_id);

create index if not exists book_media_assets_kind_idx
  on book_media_assets (kind);

create table if not exists book_activities (
  id uuid primary key default gen_random_uuid(),
  package_slug text not null,
  component_slug text not null,
  page_id text null,
  page_number integer null,
  title text not null,
  type text not null,
  instructions text null,
  content jsonb not null default '{}'::jsonb,
  correct_answers jsonb not null default '{}'::jsonb,
  feedback jsonb not null default '{}'::jsonb,
  media_id uuid null references book_media_assets(id) on delete set null,
  status text not null default 'draft',
  created_by uuid null references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_activities_type_check check (type in (
    'multiple_choice',
    'open_answer',
    'typed_gap_fill',
    'media_video',
    'media_audio',
    'text_panel',
    'external_link',
    'existing_activity_link'
  )),
  constraint book_activities_status_check check (status in ('draft', 'published'))
);

create index if not exists book_activities_component_idx
  on book_activities (package_slug, component_slug);

create index if not exists book_activities_page_idx
  on book_activities (package_slug, component_slug, page_id);

create index if not exists book_activities_type_idx
  on book_activities (type);

create index if not exists book_activities_status_idx
  on book_activities (status);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_book_page_hotspots_updated_at on book_page_hotspots;
create trigger set_book_page_hotspots_updated_at
before update on book_page_hotspots
for each row execute function set_updated_at();

drop trigger if exists set_book_activities_updated_at on book_activities;
create trigger set_book_activities_updated_at
before update on book_activities
for each row execute function set_updated_at();
