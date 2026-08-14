-- Durable hosted Open Response upload sessions and committed draft/review imports.
-- Source bytes remain in object storage; only trusted descriptors and projections live here.

create table if not exists builder_open_response_imports (
  id uuid primary key default gen_random_uuid(),
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
  activity_key text not null check (activity_key ~ '^[a-z0-9][a-z0-9-]{1,127}$'),
  revision bigint not null check (revision >= 1),
  fingerprint_sha256 text not null check (fingerprint_sha256 ~ '^[a-f0-9]{64}$'),
  public_projection jsonb not null check (jsonb_typeof(public_projection) = 'object'),
  teacher_projection jsonb not null check (jsonb_typeof(teacher_projection) = 'object'),
  archive_manifest jsonb not null check (jsonb_typeof(archive_manifest) = 'object'),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  updated_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint builder_open_response_imports_component_package_fk
    foreign key (book_component_id, book_package_id)
    references book_components(id, book_package_id) on delete cascade,
  constraint builder_open_response_imports_identity_unique unique (book_component_id, activity_key)
);

create table if not exists builder_open_response_import_sessions (
  id uuid primary key,
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
  activity_key text not null check (activity_key ~ '^[a-z0-9][a-z0-9-]{1,127}$'),
  expected_revision bigint not null check (expected_revision >= 0),
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  file_descriptors jsonb not null check (jsonb_typeof(file_descriptors) = 'array'),
  state text not null default 'prepared' check (state in ('prepared','finalizing','succeeded','failed','cancelled')),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  expires_at timestamptz not null,
  resulting_revision bigint,
  fingerprint_sha256 text,
  failure_code text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint builder_open_response_import_sessions_component_package_fk
    foreign key (book_component_id, book_package_id)
    references book_components(id, book_package_id) on delete cascade,
  constraint builder_open_response_import_sessions_mutation_unique
    unique (book_component_id, activity_key, client_mutation_id),
  constraint builder_open_response_import_sessions_result_check check (
    (state = 'succeeded' and resulting_revision is not null and fingerprint_sha256 ~ '^[a-f0-9]{64}$')
    or (state <> 'succeeded' and resulting_revision is null and fingerprint_sha256 is null)
  )
);

create index if not exists builder_open_response_import_sessions_expiry_idx
  on builder_open_response_import_sessions(state, expires_at);
create index if not exists builder_open_response_import_sessions_actor_idx
  on builder_open_response_import_sessions(created_by_builder_user_id, created_at desc);

create table if not exists builder_open_response_import_revisions (
  id bigint generated always as identity primary key,
  import_id uuid not null references builder_open_response_imports(id) on delete restrict,
  upload_id uuid not null references builder_open_response_import_sessions(id) on delete restrict,
  revision bigint not null check (revision >= 1),
  fingerprint_sha256 text not null check (fingerprint_sha256 ~ '^[a-f0-9]{64}$'),
  public_projection jsonb not null check (jsonb_typeof(public_projection) = 'object'),
  teacher_projection jsonb not null check (jsonb_typeof(teacher_projection) = 'object'),
  archive_manifest jsonb not null check (jsonb_typeof(archive_manifest) = 'object'),
  changed_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  client_mutation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint builder_open_response_import_revisions_revision_unique unique (import_id, revision),
  constraint builder_open_response_import_revisions_upload_unique unique (upload_id),
  constraint builder_open_response_import_revisions_mutation_unique unique (import_id, client_mutation_id)
);

create or replace function reject_builder_open_response_import_revision_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Builder Open Response import revisions are append-only';
end;
$$;

drop trigger if exists builder_open_response_import_revisions_append_only on builder_open_response_import_revisions;
create trigger builder_open_response_import_revisions_append_only
before update or delete on builder_open_response_import_revisions
for each row execute function reject_builder_open_response_import_revision_mutation();

create or replace function prepare_builder_open_response_import(
  requested_book_slug text,
  requested_component_slug text,
  requested_activity_key text,
  requested_expected_revision bigint,
  requested_client_mutation_id uuid,
  requested_upload_id uuid,
  requested_request_sha256 text,
  requested_file_descriptors jsonb,
  actor_builder_user_id uuid,
  requested_expires_at timestamptz
)
returns table (outcome text, upload_id uuid, current_revision bigint, session_state text, file_descriptors jsonb)
language plpgsql as $$
declare
  resolved_package_id uuid;
  resolved_component_id uuid;
  current_import_revision bigint;
  existing_session builder_open_response_import_sessions%rowtype;
begin
  if not exists (select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text, null::uuid, null::bigint, null::text, null::jsonb;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','builder-open-response-import',requested_book_slug,requested_component_slug,requested_activity_key),0));
  select package.id, component.id into resolved_package_id, resolved_component_id
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_package_id is null then
    return query select 'resource_not_found'::text, null::uuid, null::bigint, null::text, null::jsonb;
    return;
  end if;
  select * into existing_session from builder_open_response_import_sessions
  where book_component_id=resolved_component_id and activity_key=requested_activity_key and client_mutation_id=requested_client_mutation_id;
  if existing_session.id is not null then
    if existing_session.request_sha256 <> requested_request_sha256 then
      return query select 'mutation_id_conflict'::text, existing_session.id, coalesce((select revision from builder_open_response_imports where book_component_id=resolved_component_id and activity_key=requested_activity_key),0), existing_session.state, null::jsonb;
    else
      return query select 'idempotent'::text, existing_session.id, coalesce((select revision from builder_open_response_imports where book_component_id=resolved_component_id and activity_key=requested_activity_key),0), existing_session.state, existing_session.file_descriptors;
    end if;
    return;
  end if;
  select coalesce((select revision from builder_open_response_imports where book_component_id=resolved_component_id and activity_key=requested_activity_key),0) into current_import_revision;
  if current_import_revision <> requested_expected_revision then
    return query select 'revision_conflict'::text, null::uuid, current_import_revision, null::text, null::jsonb;
    return;
  end if;
  insert into builder_open_response_import_sessions(id,book_package_id,book_component_id,activity_key,expected_revision,client_mutation_id,request_sha256,file_descriptors,created_by_builder_user_id,expires_at)
  values(requested_upload_id,resolved_package_id,resolved_component_id,requested_activity_key,requested_expected_revision,requested_client_mutation_id,requested_request_sha256,requested_file_descriptors,actor_builder_user_id,requested_expires_at);
  return query select 'prepared'::text, requested_upload_id, current_import_revision, 'prepared'::text, requested_file_descriptors;
end;
$$;

create or replace function claim_builder_open_response_import(
  requested_upload_id uuid, requested_expected_revision bigint, requested_client_mutation_id uuid, actor_builder_user_id uuid
)
returns table (outcome text, current_revision bigint, session_state text, activity_key text, file_descriptors jsonb)
language plpgsql as $$
declare
  session builder_open_response_import_sessions%rowtype;
  current_import_revision bigint;
begin
  select * into session from builder_open_response_import_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id <> actor_builder_user_id then
    return query select 'session_not_found'::text, null::bigint, null::text, null::text, null::jsonb; return;
  end if;
  if session.client_mutation_id <> requested_client_mutation_id or session.expected_revision <> requested_expected_revision then
    return query select 'session_identity_conflict'::text, null::bigint, session.state, session.activity_key, null::jsonb; return;
  end if;
  select coalesce((
    select current_row.revision
    from builder_open_response_imports current_row
    where current_row.book_component_id=session.book_component_id
      and current_row.activity_key=session.activity_key
  ),0) into current_import_revision;
  if session.state='succeeded' then return query select 'idempotent'::text,current_import_revision,session.state,session.activity_key,session.file_descriptors; return; end if;
  if session.state='finalizing' then return query select 'finalize_in_progress'::text,current_import_revision,session.state,session.activity_key,null::jsonb; return; end if;
  if session.state<>'prepared' then return query select 'invalid_session_state'::text,current_import_revision,session.state,session.activity_key,null::jsonb; return; end if;
  if session.expires_at <= now() then
    update builder_open_response_import_sessions set state='failed',failure_code='expired_session',updated_at=now() where id=session.id;
    return query select 'expired_session'::text,current_import_revision,'failed'::text,session.activity_key,null::jsonb; return;
  end if;
  if current_import_revision <> requested_expected_revision then return query select 'revision_conflict'::text,current_import_revision,session.state,session.activity_key,null::jsonb; return; end if;
  update builder_open_response_import_sessions set state='finalizing',updated_at=now() where id=session.id;
  return query select 'claimed'::text,current_import_revision,'finalizing'::text,session.activity_key,session.file_descriptors;
end;
$$;

create or replace function commit_builder_open_response_import(
  requested_upload_id uuid, requested_expected_revision bigint, requested_client_mutation_id uuid,
  requested_fingerprint_sha256 text, requested_public_projection jsonb, requested_teacher_projection jsonb,
  requested_archive_manifest jsonb, actor_builder_user_id uuid
)
returns table (outcome text, saved_revision bigint, current_revision bigint, fingerprint_sha256 text)
language plpgsql as $$
declare
  session builder_open_response_import_sessions%rowtype;
  current_import builder_open_response_imports%rowtype;
  next_revision bigint;
  target_import_id uuid;
begin
  select * into session from builder_open_response_import_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id then return query select 'session_not_found'::text,null::bigint,null::bigint,null::text; return; end if;
  if session.client_mutation_id<>requested_client_mutation_id or session.expected_revision<>requested_expected_revision then return query select 'session_identity_conflict'::text,null::bigint,null::bigint,null::text; return; end if;
  if session.state='succeeded' then return query select 'idempotent'::text,session.resulting_revision,session.resulting_revision,session.fingerprint_sha256; return; end if;
  if session.state<>'finalizing' then return query select 'invalid_session_state'::text,null::bigint,null::bigint,null::text; return; end if;
  select current_row.* into current_import
  from builder_open_response_imports current_row
  where current_row.book_component_id=session.book_component_id
    and current_row.activity_key=session.activity_key
  for update;
  if coalesce(current_import.revision,0)<>requested_expected_revision then return query select 'revision_conflict'::text,null::bigint,coalesce(current_import.revision,0),null::text; return; end if;
  next_revision := requested_expected_revision + 1;
  if current_import.id is null then
    insert into builder_open_response_imports(book_package_id,book_component_id,activity_key,revision,fingerprint_sha256,public_projection,teacher_projection,archive_manifest,created_by_builder_user_id,updated_by_builder_user_id)
    values(session.book_package_id,session.book_component_id,session.activity_key,next_revision,requested_fingerprint_sha256,requested_public_projection,requested_teacher_projection,requested_archive_manifest,actor_builder_user_id,actor_builder_user_id)
    returning id into target_import_id;
  else
    target_import_id := current_import.id;
    update builder_open_response_imports set revision=next_revision,fingerprint_sha256=requested_fingerprint_sha256,public_projection=requested_public_projection,teacher_projection=requested_teacher_projection,archive_manifest=requested_archive_manifest,updated_by_builder_user_id=actor_builder_user_id,updated_at=now() where id=target_import_id;
  end if;
  insert into builder_open_response_import_revisions(import_id,upload_id,revision,fingerprint_sha256,public_projection,teacher_projection,archive_manifest,changed_by_builder_user_id,client_mutation_id)
  values(target_import_id,session.id,next_revision,requested_fingerprint_sha256,requested_public_projection,requested_teacher_projection,requested_archive_manifest,actor_builder_user_id,requested_client_mutation_id);
  update builder_open_response_import_sessions set state='succeeded',resulting_revision=next_revision,fingerprint_sha256=requested_fingerprint_sha256,finalized_at=now(),updated_at=now() where id=session.id;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'builder_open_response_source_imported','builder_open_response_import',target_import_id::text,jsonb_build_object('activityKey',session.activity_key,'revision',next_revision,'fingerprint',requested_fingerprint_sha256));
  return query select 'saved'::text,next_revision,next_revision,requested_fingerprint_sha256;
end;
$$;

create or replace function fail_builder_open_response_import(requested_upload_id uuid, actor_builder_user_id uuid, requested_failure_code text)
returns boolean language plpgsql as $$
begin
  update builder_open_response_import_sessions
  set state='failed',failure_code=left(requested_failure_code,64),updated_at=now()
  where id=requested_upload_id and created_by_builder_user_id=actor_builder_user_id and state in ('prepared','finalizing');
  return found;
end;
$$;

drop trigger if exists set_builder_open_response_imports_updated_at on builder_open_response_imports;
create trigger set_builder_open_response_imports_updated_at before update on builder_open_response_imports for each row execute function set_updated_at();
drop trigger if exists set_builder_open_response_import_sessions_updated_at on builder_open_response_import_sessions;
create trigger set_builder_open_response_import_sessions_updated_at before update on builder_open_response_import_sessions for each row execute function set_updated_at();
