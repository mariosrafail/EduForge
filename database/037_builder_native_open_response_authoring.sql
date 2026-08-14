-- Atomic paired native draft saves and reusable private native raster uploads.
-- Canonical activity payloads remain in builder_component_documents; binary metadata remains in book_assets.

create table if not exists builder_native_activity_pair_mutations (
  id bigint generated always as identity primary key,
  book_component_id uuid not null references book_components(id) on delete restrict,
  activity_id text not null check (activity_id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  resulting_public_revision bigint not null check (resulting_public_revision >= 1),
  resulting_teacher_revision bigint not null check (resulting_teacher_revision >= 1),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(book_component_id, activity_id, client_mutation_id)
);

drop trigger if exists builder_native_activity_pair_mutations_immutable on builder_native_activity_pair_mutations;
create trigger builder_native_activity_pair_mutations_immutable
before update or delete on builder_native_activity_pair_mutations
for each row execute function reject_builder_component_document_revision_mutation();

create or replace function save_builder_native_activity_pair(
  requested_book_slug text,
  requested_component_slug text,
  requested_activity_id text,
  requested_schema_version text,
  expected_public_revision bigint,
  expected_teacher_revision bigint,
  requested_public_payload jsonb,
  requested_public_sha256 text,
  requested_teacher_payload jsonb,
  requested_teacher_sha256 text,
  requested_request_sha256 text,
  actor_builder_user_id uuid,
  requested_client_mutation_id uuid
)
returns table(outcome text, public_revision bigint, teacher_revision bigint, current_public_revision bigint, current_teacher_revision bigint)
language plpgsql as $$
declare
  resolved_component_id uuid;
  public_document builder_component_documents%rowtype;
  teacher_document builder_component_documents%rowtype;
  replay builder_native_activity_pair_mutations%rowtype;
  next_public_revision bigint;
  next_teacher_revision bigint;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text,null::bigint,null::bigint,null::bigint,null::bigint; return;
  end if;
  select component.id into resolved_component_id
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null then
    return query select 'resource_not_found'::text,null::bigint,null::bigint,null::bigint,null::bigint; return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('builder-native-activity:' || resolved_component_id::text || ':' || requested_activity_id,0));
  select * into replay from builder_native_activity_pair_mutations
  where book_component_id=resolved_component_id and activity_id=requested_activity_id and client_mutation_id=requested_client_mutation_id;
  if replay.id is not null then
    if replay.request_sha256<>requested_request_sha256 then
      return query select 'mutation_id_conflict'::text,replay.resulting_public_revision,replay.resulting_teacher_revision,replay.resulting_public_revision,replay.resulting_teacher_revision;
    else
      return query select 'idempotent'::text,replay.resulting_public_revision,replay.resulting_teacher_revision,replay.resulting_public_revision,replay.resulting_teacher_revision;
    end if;
    return;
  end if;

  select * into public_document from builder_component_documents
  where book_component_id=resolved_component_id and document_type='native_activity_public' and document_key=requested_activity_id for update;
  select * into teacher_document from builder_component_documents
  where book_component_id=resolved_component_id and document_type='native_activity_teacher' and document_key=requested_activity_id for update;
  if public_document.id is null or teacher_document.id is null then
    return query select 'resource_not_found'::text,null::bigint,null::bigint,null::bigint,null::bigint; return;
  end if;
  if public_document.revision<>expected_public_revision or teacher_document.revision<>expected_teacher_revision then
    return query select 'revision_conflict'::text,null::bigint,null::bigint,public_document.revision,teacher_document.revision; return;
  end if;

  next_public_revision := public_document.revision + 1;
  next_teacher_revision := teacher_document.revision + 1;
  update builder_component_documents set schema_version=requested_schema_version,revision=next_public_revision,payload=requested_public_payload,payload_sha256=requested_public_sha256,updated_by_builder_user_id=actor_builder_user_id,updated_at=now() where id=public_document.id;
  update builder_component_documents set schema_version=requested_schema_version,revision=next_teacher_revision,payload=requested_teacher_payload,payload_sha256=requested_teacher_sha256,updated_by_builder_user_id=actor_builder_user_id,updated_at=now() where id=teacher_document.id;
  insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id)
  values
    (public_document.id,next_public_revision,requested_public_payload,requested_public_sha256,actor_builder_user_id,requested_client_mutation_id),
    (teacher_document.id,next_teacher_revision,requested_teacher_payload,requested_teacher_sha256,actor_builder_user_id,requested_client_mutation_id);
  insert into builder_native_activity_pair_mutations(book_component_id,activity_id,client_mutation_id,request_sha256,resulting_public_revision,resulting_teacher_revision,created_by_builder_user_id)
  values(resolved_component_id,requested_activity_id,requested_client_mutation_id,requested_request_sha256,next_public_revision,next_teacher_revision,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'native_activity_pair_saved','builder_component_document',public_document.id::text,
    jsonb_build_object('book_slug',requested_book_slug,'component_slug',requested_component_slug,'activity_id',requested_activity_id,'public_revision',next_public_revision,'teacher_revision',next_teacher_revision));
  return query select 'saved'::text,next_public_revision,next_teacher_revision,next_public_revision,next_teacher_revision;
end;
$$;

create table if not exists builder_native_asset_upload_sessions (
  id uuid primary key,
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
  activity_id text not null check (activity_id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  asset_slot text not null check (asset_slot ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  file_descriptor jsonb not null check (jsonb_typeof(file_descriptor)='object'),
  staging_object_key text not null,
  state text not null default 'prepared' check (state in ('prepared','finalizing','completed','failed')),
  resulting_asset_id uuid references book_assets(id) on delete restrict,
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  expires_at timestamptz not null,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(book_component_id, client_mutation_id),
  constraint builder_native_asset_upload_component_package_fk foreign key(book_component_id,book_package_id) references book_components(id,book_package_id) on delete cascade
);
create index if not exists builder_native_asset_upload_expiry_idx on builder_native_asset_upload_sessions(state,expires_at);

create or replace function prepare_builder_native_asset_upload(
  requested_book_slug text, requested_component_slug text, requested_activity_id text, requested_asset_slot text,
  requested_client_mutation_id uuid, requested_upload_id uuid, requested_request_sha256 text,
  requested_file_descriptor jsonb, requested_staging_object_key text, actor_builder_user_id uuid, requested_expires_at timestamptz
)
returns table(outcome text, upload_id uuid, session_state text, file_descriptor jsonb, staging_object_key text)
language plpgsql as $$
declare resolved_package_id uuid; resolved_component_id uuid; existing builder_native_asset_upload_sessions%rowtype;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor'::text,null::uuid,null::text,null::jsonb,null::text; return; end if;
  select package.id,component.id into resolved_package_id,resolved_component_id from book_packages package join book_components component on component.book_package_id=package.id where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null or not exists(select 1 from builder_component_documents where book_component_id=resolved_component_id and document_type='native_activity_public' and document_key=requested_activity_id) then return query select 'resource_not_found'::text,null::uuid,null::text,null::jsonb,null::text; return; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-native-assets:' || resolved_component_id::text || ':' || requested_activity_id,0));
  select * into existing from builder_native_asset_upload_sessions where book_component_id=resolved_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.id is not null then
    if existing.request_sha256<>requested_request_sha256 then return query select 'mutation_id_conflict'::text,existing.id,existing.state,null::jsonb,null::text;
    else return query select 'idempotent'::text,existing.id,existing.state,existing.file_descriptor,existing.staging_object_key; end if; return;
  end if;
  insert into builder_native_asset_upload_sessions(id,book_package_id,book_component_id,activity_id,asset_slot,client_mutation_id,request_sha256,file_descriptor,staging_object_key,created_by_builder_user_id,expires_at)
  values(requested_upload_id,resolved_package_id,resolved_component_id,requested_activity_id,requested_asset_slot,requested_client_mutation_id,requested_request_sha256,requested_file_descriptor,requested_staging_object_key,actor_builder_user_id,requested_expires_at);
  return query select 'prepared'::text,requested_upload_id,'prepared'::text,requested_file_descriptor,requested_staging_object_key;
end;
$$;

create or replace function claim_builder_native_asset_upload(requested_upload_id uuid, requested_client_mutation_id uuid, actor_builder_user_id uuid)
returns table(outcome text, book_package_id uuid, book_component_id uuid, activity_id text, asset_slot text, file_descriptor jsonb, staging_object_key text, resulting_asset_id uuid)
language plpgsql as $$
declare session builder_native_asset_upload_sessions%rowtype;
begin
  select * into session from builder_native_asset_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id then return query select 'session_not_found'::text,null::uuid,null::uuid,null::text,null::text,null::jsonb,null::text,null::uuid; return; end if;
  if session.client_mutation_id<>requested_client_mutation_id then return query select 'session_identity_conflict'::text,null::uuid,null::uuid,null::text,null::text,null::jsonb,null::text,null::uuid; return; end if;
  if session.state='completed' then return query select 'idempotent'::text,session.book_package_id,session.book_component_id,session.activity_id,session.asset_slot,session.file_descriptor,session.staging_object_key,session.resulting_asset_id; return; end if;
  if session.state<>'prepared' then return query select 'invalid_session_state'::text,null::uuid,null::uuid,null::text,null::text,null::jsonb,null::text,null::uuid; return; end if;
  if session.expires_at<=now() then update builder_native_asset_upload_sessions set state='failed',failure_code='expired_session',updated_at=now() where id=session.id; return query select 'expired_session'::text,null::uuid,null::uuid,null::text,null::text,null::jsonb,null::text,null::uuid; return; end if;
  update builder_native_asset_upload_sessions set state='finalizing',updated_at=now() where id=session.id;
  return query select 'claimed'::text,session.book_package_id,session.book_component_id,session.activity_id,session.asset_slot,session.file_descriptor,session.staging_object_key,null::uuid;
end;
$$;

create or replace function complete_builder_native_asset_upload(
  requested_upload_id uuid, actor_builder_user_id uuid, requested_object_key text, requested_storage_bucket text,
  requested_mime_type text, requested_byte_size bigint, requested_checksum text, requested_width int, requested_height int
)
returns uuid language plpgsql as $$
declare session builder_native_asset_upload_sessions%rowtype; edition book_editions%rowtype; created_asset_id uuid;
begin
  select * into session from builder_native_asset_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id or session.state<>'finalizing' then raise exception 'native upload session cannot be completed'; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-native-assets:' || session.book_component_id::text || ':' || session.activity_id,0));
  insert into book_editions(book_package_id,edition_identifier,title,status,source_metadata)
  values(session.book_package_id,'builder-draft','Builder native draft assets','draft','{"source":"native-activity-builder"}'::jsonb)
  on conflict(book_package_id,edition_identifier) do update set updated_at=now()
  returning * into edition;
  select id into created_asset_id from book_assets
  where book_package_id=session.book_package_id and book_component_id=session.book_component_id
    and object_key=requested_object_key and checksum_sha256=requested_checksum and asset_role='activity_artwork'
    and publication_status='draft' and storage_profile='private' and access_level='internal'
    and source_metadata->>'native_activity_id'=session.activity_id and source_metadata->>'asset_slot'=session.asset_slot
  limit 1;
  if created_asset_id is null then
    insert into book_assets(book_package_id,edition_id,book_component_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,width,height,edition_identifier,version,publication_status,access_level,source_metadata)
    values(session.book_package_id,edition.id,session.book_component_id,
      (select slug from book_packages where id=session.book_package_id)||'.builder-native.'||session.activity_id||'.'||session.asset_slot||'.'||left(requested_checksum,12),
      'activity_artwork',requested_object_key,'private',requested_storage_bucket,requested_mime_type,requested_byte_size,requested_checksum,requested_width,requested_height,'builder-draft','native-draft','draft','internal',
      jsonb_build_object('native_activity_id',session.activity_id,'asset_slot',session.asset_slot,'upload_session_id',session.id))
    returning id into created_asset_id;
  end if;
  update builder_native_asset_upload_sessions set state='completed',resulting_asset_id=created_asset_id,updated_at=now() where id=session.id;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'native_activity_asset_finalized','book_asset',created_asset_id::text,
    jsonb_build_object('native_activity_id',session.activity_id,'asset_slot',session.asset_slot,'asset_role','activity_artwork'));
  return created_asset_id;
end;
$$;

create or replace function fail_builder_native_asset_upload(requested_upload_id uuid, actor_builder_user_id uuid, requested_failure_code text)
returns boolean language plpgsql as $$
begin
  update builder_native_asset_upload_sessions set state='failed',failure_code=requested_failure_code,updated_at=now()
  where id=requested_upload_id and created_by_builder_user_id=actor_builder_user_id and state in ('prepared','finalizing');
  return found;
end;
$$;
