-- Production book-asset metadata. Binary bytes remain in S3-compatible object storage.

create table if not exists book_editions (
  id uuid primary key default gen_random_uuid(),
  book_package_id uuid not null references book_packages(id) on delete cascade,
  edition_identifier text not null,
  title text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_package_id, edition_identifier),
  unique (id, book_package_id),
  check (edition_identifier ~ '^[a-z0-9][a-z0-9._-]{0,63}$')
);

create table if not exists book_pages (
  id uuid primary key default gen_random_uuid(),
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
  unit_id uuid references units(id) on delete cascade,
  stable_key text not null,
  page_number int,
  label text,
  sort_order int not null default 1,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_package_id, stable_key),
  unique (id, book_package_id),
  check (stable_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'),
  check (stable_key !~ '(^|/)\.\.(/|$)'),
  check (page_number is null or page_number > 0)
);

create or replace function validate_book_page_relationships()
returns trigger as $$
declare
  component_package uuid;
  unit_component uuid;
begin
  select book_package_id into component_package from book_components where id = new.book_component_id;
  if component_package is distinct from new.book_package_id then
    raise exception 'book page component does not belong to package';
  end if;
  if new.unit_id is not null then
    select book_component_id into unit_component from units where id = new.unit_id;
    if unit_component is distinct from new.book_component_id then
      raise exception 'book page unit does not belong to component';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists validate_book_page_relationships_trigger on book_pages;
create trigger validate_book_page_relationships_trigger
before insert or update on book_pages
for each row execute function validate_book_page_relationships();

create table if not exists book_asset_imports (
  id uuid primary key default gen_random_uuid(),
  book_package_id uuid references book_packages(id) on delete cascade,
  edition_id uuid references book_editions(id) on delete cascade,
  manifest_checksum_sha256 text not null,
  manifest_schema_version text not null,
  book_version text not null,
  environment text not null default 'staging',
  status text not null default 'processing' check (status in ('draft', 'processing', 'published', 'archived', 'failed', 'cleaned')),
  summary jsonb not null default '{}'::jsonb,
  failure_details jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint book_asset_imports_edition_package_fk foreign key (edition_id, book_package_id)
    references book_editions(id, book_package_id) on delete cascade,
  unique (book_package_id, manifest_checksum_sha256),
  check (manifest_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  check (environment in ('local', 'test', 'staging'))
);

create table if not exists book_assets (
  id uuid primary key default gen_random_uuid(),
  book_package_id uuid not null references book_packages(id) on delete cascade,
  edition_id uuid not null,
  book_component_id uuid references book_components(id) on delete cascade,
  unit_id uuid references units(id) on delete cascade,
  page_id uuid references book_pages(id) on delete cascade,
  activity_id uuid references activities(id) on delete set null,
  import_id uuid references book_asset_imports(id) on delete set null,
  source_asset_id uuid references book_assets(id) on delete restrict,
  stable_logical_key text not null,
  asset_role text not null,
  object_key text not null,
  storage_profile text not null,
  storage_bucket text not null,
  mime_type text not null,
  byte_size bigint not null,
  checksum_sha256 text not null,
  width int,
  height int,
  duration_seconds numeric(12,3),
  edition_identifier text not null,
  version text not null,
  publication_status text not null default 'draft',
  access_level text not null default 'entitled',
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_assets_edition_package_fk foreign key (edition_id, book_package_id)
    references book_editions(id, book_package_id) on delete cascade,
  constraint book_assets_page_package_fk foreign key (page_id, book_package_id)
    references book_pages(id, book_package_id) on delete cascade,
  constraint book_assets_public_profile_check check (
    access_level not in ('public', 'preview') or storage_profile = 'public'
  ),
  constraint book_assets_archive_delivery_check check (
    storage_profile <> 'archive' or access_level = 'internal'
  ),
  constraint book_assets_dimensions_check check (
    (width is null and height is null) or (width > 0 and height > 0)
  ),
  constraint book_assets_duration_check check (duration_seconds is null or duration_seconds >= 0),
  constraint book_assets_byte_size_check check (byte_size >= 0),
  constraint book_assets_checksum_check check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  constraint book_assets_mime_type_check check (mime_type in ('image/jpeg','image/png','image/webp','image/svg+xml','audio/mpeg','audio/mp4','video/mp4','application/pdf','application/zip','application/json')),
  constraint book_assets_role_check check (asset_role ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint book_assets_bucket_check check (storage_bucket ~ '^[a-z0-9][a-z0-9.-]{1,62}$'),
  constraint book_assets_logical_key_check check (
    stable_logical_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$'
    and stable_logical_key !~ '(^|/)\.\.(/|$)'
  ),
  constraint book_assets_object_key_check check (
    object_key ~ '^[a-z0-9][a-z0-9._/-]{0,1023}$'
    and object_key !~ '(^|/)\.\.(/|$)'
    and object_key !~ '//'
  ),
  constraint book_assets_storage_profile_check check (storage_profile in ('public', 'private', 'archive')),
  constraint book_assets_publication_status_check check (publication_status in ('draft', 'processing', 'published', 'archived', 'failed')),
  constraint book_assets_access_level_check check (access_level in ('public', 'preview', 'entitled', 'internal')),
  constraint book_assets_version_check check (version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
  constraint book_assets_edition_identifier_check check (edition_identifier ~ '^[a-z0-9][a-z0-9._-]{0,63}$')
);

create unique index if not exists book_assets_logical_version_unique_idx
  on book_assets (book_package_id, edition_identifier, version, stable_logical_key)
  where publication_status <> 'archived';
create unique index if not exists book_assets_object_unique_idx on book_assets (storage_bucket, object_key);
create unique index if not exists book_editions_one_published_per_package_idx
  on book_editions (book_package_id) where status = 'published';
create unique index if not exists book_asset_imports_one_published_per_edition_idx
  on book_asset_imports (edition_id) where status = 'published';
create unique index if not exists book_assets_one_published_logical_key_idx
  on book_assets (book_package_id, stable_logical_key) where publication_status = 'published';
create index if not exists book_assets_package_status_idx on book_assets (book_package_id, publication_status, access_level);
create index if not exists book_assets_page_idx on book_assets (page_id) where page_id is not null;
create index if not exists book_assets_activity_idx on book_assets (activity_id) where activity_id is not null;
create index if not exists book_asset_imports_status_idx on book_asset_imports (status, started_at);

create or replace function validate_book_asset_relationships()
returns trigger as $$
declare
  component_package uuid;
  unit_component uuid;
  activity_package uuid;
  asset_page_component uuid;
  asset_page_unit uuid;
  stored_edition_identifier text;
  stored_package_slug text;
begin
  select edition_identifier into stored_edition_identifier from book_editions where id = new.edition_id;
  if stored_edition_identifier is distinct from new.edition_identifier then
    raise exception 'book asset edition identifier does not match edition';
  end if;
  select slug into stored_package_slug from book_packages where id = new.book_package_id;
  if new.stable_logical_key <> stored_package_slug
     and new.stable_logical_key not like stored_package_slug || '.%' then
    raise exception 'book asset logical key is not namespaced to its package';
  end if;
  if new.book_component_id is not null then
    select book_package_id into component_package from book_components where id = new.book_component_id;
    if component_package is distinct from new.book_package_id then
      raise exception 'book asset component does not belong to package';
    end if;
  end if;
  if new.unit_id is not null then
    select book_component_id into unit_component from units where id = new.unit_id;
    if new.book_component_id is null or unit_component is distinct from new.book_component_id then
      raise exception 'book asset unit does not belong to component';
    end if;
  end if;
  if new.activity_id is not null then
    select bp.id into activity_package
    from activities a
    join lessons l on l.id = a.lesson_id
    join units u on u.id = l.unit_id
    join book_components bc on bc.id = u.book_component_id
    join book_packages bp on bp.id = bc.book_package_id
    where a.id = new.activity_id;
    if activity_package is distinct from new.book_package_id then
      raise exception 'book asset activity does not belong to package';
    end if;
  end if;
  if new.page_id is not null then
    select book_component_id, unit_id into asset_page_component, asset_page_unit from book_pages where id = new.page_id;
    if new.book_component_id is null or asset_page_component is distinct from new.book_component_id then
      raise exception 'book asset page does not belong to component';
    end if;
    if asset_page_unit is distinct from new.unit_id then
      raise exception 'book asset page does not belong to unit';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists validate_book_asset_relationships_trigger on book_assets;
create trigger validate_book_asset_relationships_trigger
before insert or update on book_assets
for each row execute function validate_book_asset_relationships();

drop trigger if exists set_book_editions_updated_at on book_editions;
create trigger set_book_editions_updated_at before update on book_editions for each row execute function set_updated_at();
drop trigger if exists set_book_pages_updated_at on book_pages;
create trigger set_book_pages_updated_at before update on book_pages for each row execute function set_updated_at();
drop trigger if exists set_book_asset_imports_updated_at on book_asset_imports;
create trigger set_book_asset_imports_updated_at before update on book_asset_imports for each row execute function set_updated_at();
drop trigger if exists set_book_assets_updated_at on book_assets;
create trigger set_book_assets_updated_at before update on book_assets for each row execute function set_updated_at();
