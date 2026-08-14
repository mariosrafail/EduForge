-- Immutable hosted Builder component releases and their single mutable publication head.

create table if not exists book_component_releases (
  id uuid primary key default gen_random_uuid(),
  book_package_id uuid not null references book_packages(id) on delete restrict,
  book_component_id uuid not null references book_components(id) on delete restrict,
  release_number bigint not null check (release_number >= 1),
  release_schema_version text not null check (release_schema_version ~ '^[0-9]+\.[0-9]+$'),
  compiler_id text not null check (compiler_id ~ '^[a-z0-9][a-z0-9-]{2,127}$'),
  runtime_compatibility_sha256 text not null check (runtime_compatibility_sha256 ~ '^[a-f0-9]{64}$'),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  source_snapshot_sha256 text not null check (source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  public_projection jsonb not null check (jsonb_typeof(public_projection) = 'object'),
  public_projection_sha256 text not null check (public_projection_sha256 ~ '^[a-f0-9]{64}$'),
  teacher_projection jsonb not null check (jsonb_typeof(teacher_projection) = 'object'),
  teacher_projection_sha256 text not null check (teacher_projection_sha256 ~ '^[a-f0-9]{64}$'),
  asset_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(asset_manifest) = 'array'),
  release_sha256 text not null check (release_sha256 ~ '^[a-f0-9]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  client_mutation_id uuid not null,
  release_note text check (release_note is null or length(release_note) <= 240),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint book_component_releases_component_package_fk
    foreign key (book_component_id, book_package_id)
    references book_components(id, book_package_id) on delete restrict,
  constraint book_component_releases_identity_component_unique unique (id, book_component_id),
  constraint book_component_releases_identity_scope_unique unique (id, book_component_id, book_package_id),
  constraint book_component_releases_number_unique unique (book_component_id, release_number),
  constraint book_component_releases_mutation_unique unique (book_component_id, client_mutation_id)
);

create index if not exists book_component_releases_recent_idx
  on book_component_releases(book_component_id, release_number desc);

create table if not exists book_component_publication_heads (
  book_component_id uuid primary key references book_components(id) on delete restrict,
  book_package_id uuid not null references book_packages(id) on delete restrict,
  release_id uuid not null unique references book_component_releases(id) on delete restrict,
  head_revision bigint not null check (head_revision >= 1),
  published_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  published_at timestamptz not null default now(),
  constraint book_component_publication_heads_component_package_fk
    foreign key (book_component_id, book_package_id)
    references book_components(id, book_package_id) on delete restrict,
  constraint book_component_publication_heads_release_scope_fk
    foreign key (release_id, book_component_id, book_package_id)
    references book_component_releases(id, book_component_id, book_package_id) on delete restrict
);

create table if not exists book_component_publication_events (
  id bigint generated always as identity primary key,
  book_package_id uuid not null references book_packages(id) on delete restrict,
  book_component_id uuid not null references book_components(id) on delete restrict,
  previous_release_id uuid references book_component_releases(id) on delete restrict,
  release_id uuid not null references book_component_releases(id) on delete restrict,
  expected_head_revision bigint not null check (expected_head_revision >= 0),
  resulting_head_revision bigint not null check (resulting_head_revision >= 1),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  client_mutation_id uuid not null,
  published_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  published_at timestamptz not null default now(),
  constraint book_component_publication_events_release_scope_fk
    foreign key (release_id, book_component_id, book_package_id)
    references book_component_releases(id, book_component_id, book_package_id) on delete restrict,
  constraint book_component_publication_events_previous_scope_fk
    foreign key (previous_release_id, book_component_id, book_package_id)
    references book_component_releases(id, book_component_id, book_package_id) on delete restrict,
  constraint book_component_publication_events_mutation_unique unique (book_component_id, client_mutation_id)
);

create table if not exists book_component_publication_mutations (
  id bigint generated always as identity primary key,
  book_component_id uuid not null references book_components(id) on delete restrict,
  release_id uuid not null references book_component_releases(id) on delete restrict,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  client_mutation_id uuid not null,
  outcome text not null check (outcome in ('published','already_active')),
  resulting_head_revision bigint not null check (resulting_head_revision >= 1),
  previous_release_id uuid references book_component_releases(id) on delete restrict,
  published_at timestamptz not null,
  constraint book_component_publication_mutations_release_component_fk
    foreign key (release_id, book_component_id)
    references book_component_releases(id, book_component_id) on delete restrict,
  constraint book_component_publication_mutations_previous_component_fk
    foreign key (previous_release_id, book_component_id)
    references book_component_releases(id, book_component_id) on delete restrict,
  constraint book_component_publication_mutations_unique unique(book_component_id,client_mutation_id)
);

create or replace function reject_book_component_release_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Book component releases are immutable';
end;
$$;

drop trigger if exists book_component_releases_immutable on book_component_releases;
create trigger book_component_releases_immutable
before update or delete on book_component_releases
for each row execute function reject_book_component_release_mutation();

drop trigger if exists book_component_publication_events_immutable on book_component_publication_events;
create trigger book_component_publication_events_immutable
before update or delete on book_component_publication_events
for each row execute function reject_book_component_release_mutation();

drop trigger if exists book_component_publication_mutations_immutable on book_component_publication_mutations;
create trigger book_component_publication_mutations_immutable
before update or delete on book_component_publication_mutations
for each row execute function reject_book_component_release_mutation();

create or replace function lock_builder_component_publication_source()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:' || new.book_component_id::text,0));
  return new;
end;
$$;

drop trigger if exists builder_component_documents_publication_lock on builder_component_documents;
create trigger builder_component_documents_publication_lock
before insert or update on builder_component_documents
for each row execute function lock_builder_component_publication_source();

drop trigger if exists builder_open_response_imports_publication_lock on builder_open_response_imports;
create trigger builder_open_response_imports_publication_lock
before insert or update on builder_open_response_imports
for each row execute function lock_builder_component_publication_source();

create or replace function builder_release_sources_are_current(requested_release_id uuid)
returns boolean language plpgsql volatile as $$
declare
  release_row book_component_releases%rowtype;
  activity_id text;
  expected jsonb;
  actual_revision bigint;
  actual_sha text;
begin
  select * into release_row from book_component_releases where id = requested_release_id;
  if release_row.id is null then return false; end if;

  select revision, payload_sha256 into actual_revision, actual_sha
  from builder_component_documents
  where book_component_id = release_row.book_component_id and document_type = 'hotspots' and document_key = 'default';
  expected := release_row.source_snapshot->'hotspots';
  if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
    or coalesce(actual_sha, expected->>'sha256') <> expected->>'sha256' then return false; end if;

  actual_revision := null; actual_sha := null;
  select revision, payload_sha256 into actual_revision, actual_sha
  from builder_component_documents
  where book_component_id = release_row.book_component_id and document_type = 'teacher_ui' and document_key = 'default';
  expected := release_row.source_snapshot->'teacherUi';
  if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
    or coalesce(actual_sha, expected->>'sha256') <> expected->>'sha256' then return false; end if;

  for activity_id in select jsonb_object_keys(release_row.source_snapshot->'openResponse') loop
    expected := release_row.source_snapshot->'openResponse'->activity_id->'document';
    actual_revision := null; actual_sha := null;
    select revision, payload_sha256 into actual_revision, actual_sha
    from builder_component_documents
    where book_component_id = release_row.book_component_id and document_type = 'open_response' and document_key = activity_id;
    if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
      or coalesce(actual_sha, expected->>'sha256') <> expected->>'sha256' then return false; end if;

    expected := release_row.source_snapshot->'openResponse'->activity_id->'import';
    actual_revision := null; actual_sha := null;
    select revision, fingerprint_sha256 into actual_revision, actual_sha
    from builder_open_response_imports
    where book_component_id = release_row.book_component_id and activity_key = activity_id;
    if coalesce(actual_revision, 0) <> (expected->>'revision')::bigint
      or (actual_revision is not null and actual_sha <> expected->>'sha256') then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function create_builder_component_release(
  requested_book_slug text,
  requested_component_slug text,
  requested_release_schema_version text,
  requested_compiler_id text,
  requested_runtime_compatibility_sha256 text,
  requested_source_snapshot jsonb,
  requested_source_snapshot_sha256 text,
  requested_public_projection jsonb,
  requested_public_projection_sha256 text,
  requested_teacher_projection jsonb,
  requested_teacher_projection_sha256 text,
  requested_asset_manifest jsonb,
  requested_release_sha256 text,
  requested_request_sha256 text,
  requested_release_note text,
  actor_builder_user_id uuid,
  requested_client_mutation_id uuid
)
returns table(outcome text, release_id uuid, release_number bigint, release_sha256 text)
language plpgsql as $$
declare
  resolved_package_id uuid;
  resolved_component_id uuid;
  replay book_component_releases%rowtype;
  inserted book_component_releases%rowtype;
  next_number bigint;
begin
  if not exists (select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text, null::uuid, null::bigint, null::text; return;
  end if;
  select package.id, component.id into resolved_package_id, resolved_component_id
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null then return query select 'component_not_found'::text,null::uuid,null::bigint,null::text; return; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:' || resolved_component_id::text, 0));
  select * into replay from book_component_releases where book_component_id=resolved_component_id and client_mutation_id=requested_client_mutation_id;
  if replay.id is not null then
    if replay.request_sha256=requested_request_sha256 then return query select 'idempotent',replay.id,replay.release_number,replay.release_sha256;
    else return query select 'mutation_id_conflict',replay.id,replay.release_number,replay.release_sha256; end if;
    return;
  end if;
  select coalesce(max(r.release_number),0)+1 into next_number from book_component_releases r where r.book_component_id=resolved_component_id;
  insert into book_component_releases(book_package_id,book_component_id,release_number,release_schema_version,compiler_id,runtime_compatibility_sha256,source_snapshot,source_snapshot_sha256,public_projection,public_projection_sha256,teacher_projection,teacher_projection_sha256,asset_manifest,release_sha256,request_sha256,client_mutation_id,release_note,created_by_builder_user_id)
  values(resolved_package_id,resolved_component_id,next_number,requested_release_schema_version,requested_compiler_id,requested_runtime_compatibility_sha256,requested_source_snapshot,requested_source_snapshot_sha256,requested_public_projection,requested_public_projection_sha256,requested_teacher_projection,requested_teacher_projection_sha256,requested_asset_manifest,requested_release_sha256,requested_request_sha256,requested_client_mutation_id,nullif(trim(requested_release_note),''),actor_builder_user_id)
  returning * into inserted;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'preview_release_created','book_component_release',inserted.id::text,jsonb_build_object('book_slug',requested_book_slug,'component_slug',requested_component_slug,'release_number',inserted.release_number,'release_sha256',inserted.release_sha256));
  return query select 'created',inserted.id,inserted.release_number,inserted.release_sha256;
end;
$$;

create or replace function publish_builder_component_release(
  requested_book_slug text,
  requested_component_slug text,
  requested_release_id uuid,
  expected_head_revision bigint,
  requested_request_sha256 text,
  actor_builder_user_id uuid,
  requested_client_mutation_id uuid
)
returns table(outcome text, release_id uuid, release_number bigint, head_revision bigint, previous_release_id uuid, published_at timestamptz)
language plpgsql as $$
declare
  resolved_package_id uuid; resolved_component_id uuid; candidate book_component_releases%rowtype;
  replay book_component_publication_mutations%rowtype; current_head book_component_publication_heads%rowtype;
  next_head_revision bigint; publication_time timestamptz := now();
begin
  if not exists (select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::uuid,null::bigint,null::bigint,null::uuid,null::timestamptz; return; end if;
  select package.id,component.id into resolved_package_id,resolved_component_id from book_packages package join book_components component on component.book_package_id=package.id where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null then return query select 'component_not_found',null::uuid,null::bigint,null::bigint,null::uuid,null::timestamptz; return; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:' || resolved_component_id::text,0));
  select * into replay from book_component_publication_mutations where book_component_id=resolved_component_id and client_mutation_id=requested_client_mutation_id;
  if replay.id is not null then
    if replay.release_id=requested_release_id and replay.request_sha256=requested_request_sha256 then select * into candidate from book_component_releases where id=replay.release_id; return query select 'idempotent',candidate.id,candidate.release_number,replay.resulting_head_revision,replay.previous_release_id,replay.published_at;
    else return query select 'mutation_id_conflict',replay.release_id,null::bigint,replay.resulting_head_revision,replay.previous_release_id,replay.published_at; end if; return;
  end if;
  select * into candidate from book_component_releases where id=requested_release_id and book_package_id=resolved_package_id and book_component_id=resolved_component_id;
  if candidate.id is null then return query select 'release_not_found',null::uuid,null::bigint,null::bigint,null::uuid,null::timestamptz; return; end if;
  select * into current_head from book_component_publication_heads where book_component_id=resolved_component_id for update;
  if coalesce(current_head.head_revision,0) <> expected_head_revision then return query select 'head_conflict',candidate.id,candidate.release_number,coalesce(current_head.head_revision,0),current_head.release_id,current_head.published_at; return; end if;
  if current_head.release_id=candidate.id then
    insert into book_component_publication_mutations(book_component_id,release_id,request_sha256,client_mutation_id,outcome,resulting_head_revision,previous_release_id,published_at)
    values(resolved_component_id,candidate.id,requested_request_sha256,requested_client_mutation_id,'already_active',current_head.head_revision,current_head.release_id,current_head.published_at);
    return query select 'already_active',candidate.id,candidate.release_number,current_head.head_revision,current_head.release_id,current_head.published_at; return;
  end if;
  if not builder_release_sources_are_current(candidate.id) then return query select 'stale_release_preview',candidate.id,candidate.release_number,coalesce(current_head.head_revision,0),current_head.release_id,current_head.published_at; return; end if;
  next_head_revision := coalesce(current_head.head_revision,0)+1;
  insert into book_component_publication_heads(book_component_id,book_package_id,release_id,head_revision,published_by_builder_user_id,published_at)
  values(resolved_component_id,resolved_package_id,candidate.id,next_head_revision,actor_builder_user_id,publication_time)
  on conflict(book_component_id) do update set release_id=excluded.release_id,head_revision=excluded.head_revision,published_by_builder_user_id=excluded.published_by_builder_user_id,published_at=excluded.published_at;
  insert into book_component_publication_events(book_package_id,book_component_id,previous_release_id,release_id,expected_head_revision,resulting_head_revision,request_sha256,client_mutation_id,published_by_builder_user_id,published_at)
  values(resolved_package_id,resolved_component_id,current_head.release_id,candidate.id,expected_head_revision,next_head_revision,requested_request_sha256,requested_client_mutation_id,actor_builder_user_id,publication_time);
  insert into book_component_publication_mutations(book_component_id,release_id,request_sha256,client_mutation_id,outcome,resulting_head_revision,previous_release_id,published_at)
  values(resolved_component_id,candidate.id,requested_request_sha256,requested_client_mutation_id,'published',next_head_revision,current_head.release_id,publication_time);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'release_published','book_component_release',candidate.id::text,jsonb_build_object('book_slug',requested_book_slug,'component_slug',requested_component_slug,'release_number',candidate.release_number,'previous_release_id',current_head.release_id,'new_release_id',candidate.id));
  return query select 'published',candidate.id,candidate.release_number,next_head_revision,current_head.release_id,publication_time;
end;
$$;
