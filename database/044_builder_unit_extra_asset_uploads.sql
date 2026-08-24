-- Durable Unit Extra managed-video uploads. Canonical content remains in
-- builder_component_documents and finalized binary metadata remains in book_assets.

create unique index if not exists units_id_component_unique_idx
  on units(id, book_component_id);

create table if not exists builder_unit_extra_asset_upload_sessions (
  id uuid primary key,
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
  unit_id uuid not null,
  unit_extra_item_id text not null check (unit_extra_item_id ~ '^video-[a-f0-9]{32}$'),
  asset_slot text not null check (asset_slot ~ '^video-[a-f0-9]{32}$'),
  expected_document_revision bigint not null check (expected_document_revision >= 1),
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  file_descriptor jsonb not null check (jsonb_typeof(file_descriptor) = 'object'),
  staging_object_key text not null,
  state text not null default 'prepared' check (state in ('prepared','finalizing','completed','failed','cancelled')),
  resulting_asset_id uuid references book_assets(id) on delete restrict,
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  expires_at timestamptz not null,
  failure_code text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint builder_unit_extra_upload_component_package_fk
    foreign key (book_component_id, book_package_id)
    references book_components(id, book_package_id) on delete cascade,
  constraint builder_unit_extra_upload_unit_component_fk
    foreign key (unit_id, book_component_id)
    references units(id, book_component_id) on delete cascade,
  constraint builder_unit_extra_upload_mutation_unique unique (book_component_id, client_mutation_id),
  constraint builder_unit_extra_upload_result_check check (
    (state='completed' and resulting_asset_id is not null and finalized_at is not null)
    or (state<>'completed' and resulting_asset_id is null)
  ),
  constraint builder_unit_extra_upload_object_key_check check (
    char_length(staging_object_key) between 1 and 1024
    and staging_object_key ~ '^[a-z0-9][a-z0-9._/-]*$'
    and staging_object_key !~ '(^|/)\.\.(/|$)'
    and staging_object_key !~ '//'
  )
);

create index if not exists builder_unit_extra_upload_expiry_idx
  on builder_unit_extra_asset_upload_sessions(state, expires_at);
create index if not exists builder_unit_extra_upload_actor_idx
  on builder_unit_extra_asset_upload_sessions(created_by_builder_user_id, created_at desc);
create index if not exists builder_unit_extra_upload_unit_idx
  on builder_unit_extra_asset_upload_sessions(unit_id, unit_extra_item_id, created_at desc);

create or replace function prepare_builder_unit_extra_asset_upload(
  requested_book_slug text,
  requested_component_slug text,
  requested_unit_slug text,
  requested_item_id text,
  requested_asset_slot text,
  requested_expected_revision bigint,
  requested_client_mutation_id uuid,
  requested_upload_id uuid,
  requested_request_sha256 text,
  requested_file_descriptor jsonb,
  requested_staging_object_key text,
  actor_builder_user_id uuid,
  requested_expires_at timestamptz
)
returns table(outcome text, upload_id uuid, current_revision bigint, session_state text, file_descriptor jsonb, staging_object_key text)
language plpgsql as $$
declare
  resolved_package_id uuid;
  resolved_component_id uuid;
  resolved_unit_id uuid;
  current_document builder_component_documents%rowtype;
  existing builder_unit_extra_asset_upload_sessions%rowtype;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text,null::uuid,null::bigint,null::text,null::jsonb,null::text; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','builder-unit-extra-upload',requested_book_slug,requested_component_slug,requested_unit_slug),0));
  select package.id,component.id,unit_record.id into resolved_package_id,resolved_component_id,resolved_unit_id
  from book_packages package
  join book_components component on component.book_package_id=package.id
  join units unit_record on unit_record.book_component_id=component.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug and unit_record.slug=requested_unit_slug
  limit 1;
  if resolved_unit_id is null then
    return query select 'resource_not_found'::text,null::uuid,null::bigint,null::text,null::jsonb,null::text; return;
  end if;
  select * into current_document from builder_component_documents
  where book_component_id=resolved_component_id and document_type='unit_extras' and document_key='default'
  for update;
  if current_document.id is null then
    return query select 'unit_extras_not_saved'::text,null::uuid,0::bigint,null::text,null::jsonb,null::text; return;
  end if;
  select * into existing from builder_unit_extra_asset_upload_sessions
  where book_component_id=resolved_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.id is not null then
    if existing.request_sha256<>requested_request_sha256 then
      return query select 'mutation_id_conflict'::text,existing.id,current_document.revision,existing.state,null::jsonb,null::text;
    else
      return query select 'idempotent'::text,existing.id,current_document.revision,existing.state,existing.file_descriptor,existing.staging_object_key;
    end if;
    return;
  end if;
  if current_document.revision<>requested_expected_revision then
    return query select 'revision_conflict'::text,null::uuid,current_document.revision,null::text,null::jsonb,null::text; return;
  end if;
  if requested_item_id<>requested_asset_slot or not exists(
    select 1
    from jsonb_array_elements(coalesce(current_document.payload->'units','[]'::jsonb)) unit_entry
    cross join lateral jsonb_array_elements(coalesce(unit_entry->'categories'->'videos','[]'::jsonb)) video_entry
    where unit_entry->>'unitId'=requested_unit_slug
      and video_entry->>'id'=requested_item_id
      and video_entry->>'assetSlot'=requested_asset_slot
  ) then
    return query select 'unit_extra_item_mismatch'::text,null::uuid,current_document.revision,null::text,null::jsonb,null::text; return;
  end if;
  insert into builder_unit_extra_asset_upload_sessions(
    id,book_package_id,book_component_id,unit_id,unit_extra_item_id,asset_slot,
    expected_document_revision,client_mutation_id,request_sha256,file_descriptor,
    staging_object_key,created_by_builder_user_id,expires_at
  ) values (
    requested_upload_id,resolved_package_id,resolved_component_id,resolved_unit_id,requested_item_id,requested_asset_slot,
    requested_expected_revision,requested_client_mutation_id,requested_request_sha256,requested_file_descriptor,
    requested_staging_object_key,actor_builder_user_id,requested_expires_at
  );
  return query select 'prepared'::text,requested_upload_id,current_document.revision,'prepared'::text,requested_file_descriptor,requested_staging_object_key;
end;
$$;

create or replace function claim_builder_unit_extra_asset_upload(
  requested_upload_id uuid,
  requested_expected_revision bigint,
  requested_client_mutation_id uuid,
  actor_builder_user_id uuid
)
returns table(outcome text, book_package_id uuid, book_component_id uuid, unit_id uuid, unit_slug text, unit_extra_item_id text, asset_slot text, current_revision bigint, file_descriptor jsonb, staging_object_key text, resulting_asset_id uuid)
language plpgsql as $$
declare
  session builder_unit_extra_asset_upload_sessions%rowtype;
  current_document builder_component_documents%rowtype;
  resolved_unit_slug text;
begin
  select * into session from builder_unit_extra_asset_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id then
    return query select 'session_not_found'::text,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text,null::bigint,null::jsonb,null::text,null::uuid; return;
  end if;
  if session.client_mutation_id<>requested_client_mutation_id or session.expected_document_revision<>requested_expected_revision then
    return query select 'session_identity_conflict'::text,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text,null::bigint,null::jsonb,null::text,null::uuid; return;
  end if;
  select unit_record.slug into resolved_unit_slug from units unit_record
  where unit_record.id=session.unit_id and unit_record.book_component_id=session.book_component_id;
  select document.* into current_document from builder_component_documents document
  where document.book_component_id=session.book_component_id and document.document_type='unit_extras' and document.document_key='default'
  for update;
  if session.state='completed' then
    return query select 'idempotent'::text,session.book_package_id,session.book_component_id,session.unit_id,resolved_unit_slug,session.unit_extra_item_id,session.asset_slot,current_document.revision,session.file_descriptor,session.staging_object_key,session.resulting_asset_id; return;
  end if;
  if session.state='finalizing' then
    return query select 'finalize_in_progress'::text,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text,current_document.revision,null::jsonb,null::text,null::uuid; return;
  end if;
  if session.state<>'prepared' then
    return query select 'invalid_session_state'::text,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text,current_document.revision,null::jsonb,null::text,null::uuid; return;
  end if;
  if session.expires_at<=now() then
    update builder_unit_extra_asset_upload_sessions set state='failed',failure_code='expired_session',updated_at=now() where id=session.id;
    return query select 'expired_session'::text,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text,current_document.revision,null::jsonb,null::text,null::uuid; return;
  end if;
  if current_document.id is null or current_document.revision<>requested_expected_revision then
    return query select 'revision_conflict'::text,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text,coalesce(current_document.revision,0),null::jsonb,null::text,null::uuid; return;
  end if;
  if resolved_unit_slug is null or not exists(
    select 1
    from jsonb_array_elements(coalesce(current_document.payload->'units','[]'::jsonb)) unit_entry
    cross join lateral jsonb_array_elements(coalesce(unit_entry->'categories'->'videos','[]'::jsonb)) video_entry
    where unit_entry->>'unitId'=resolved_unit_slug
      and video_entry->>'id'=session.unit_extra_item_id
      and video_entry->>'assetSlot'=session.asset_slot
  ) then
    return query select 'unit_extra_item_mismatch'::text,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text,current_document.revision,null::jsonb,null::text,null::uuid; return;
  end if;
  update builder_unit_extra_asset_upload_sessions set state='finalizing',updated_at=now() where id=session.id;
  return query select 'claimed'::text,session.book_package_id,session.book_component_id,session.unit_id,resolved_unit_slug,session.unit_extra_item_id,session.asset_slot,current_document.revision,session.file_descriptor,session.staging_object_key,null::uuid;
end;
$$;

create or replace function complete_builder_unit_extra_asset_upload(
  requested_upload_id uuid,
  actor_builder_user_id uuid,
  requested_object_key text,
  requested_storage_bucket text,
  requested_mime_type text,
  requested_byte_size bigint,
  requested_checksum text,
  requested_duration_ms bigint
)
returns uuid language plpgsql as $$
declare
  session builder_unit_extra_asset_upload_sessions%rowtype;
  edition book_editions%rowtype;
  created_asset_id uuid;
  existing_asset book_assets%rowtype;
  reused_existing_asset boolean:=false;
  reactivated_archived_asset boolean:=false;
begin
  select * into session from builder_unit_extra_asset_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id or session.state<>'finalizing' then raise exception 'unit extra upload session cannot be completed'; end if;
  if requested_mime_type<>'video/mp4' or requested_byte_size<1 or requested_duration_ms<1 or requested_checksum!~'^[a-f0-9]{64}$' then raise exception 'unit extra upload media metadata is invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-unit-extra-assets:' || session.book_component_id::text || ':' || session.unit_id::text,0));
  insert into book_editions(book_package_id,edition_identifier,title,status,source_metadata)
  values(session.book_package_id,'builder-draft','Builder Unit Extra draft assets','draft','{"source":"unit-extras-builder"}'::jsonb)
  on conflict(book_package_id,edition_identifier) do update set updated_at=now()
  returning * into edition;
  select * into existing_asset from book_assets where storage_bucket=requested_storage_bucket and object_key=requested_object_key limit 1;
  if existing_asset.id is not null then
    if existing_asset.book_package_id<>session.book_package_id or existing_asset.book_component_id<>session.book_component_id
      or existing_asset.unit_id<>session.unit_id or existing_asset.activity_id is not null or existing_asset.page_id is not null
      or existing_asset.asset_role<>'unit_extra_video' or existing_asset.mime_type<>'video/mp4'
      or existing_asset.byte_size<>requested_byte_size or existing_asset.checksum_sha256<>requested_checksum
      or existing_asset.publication_status not in ('draft','archived') or existing_asset.storage_profile<>'private' or existing_asset.access_level<>'internal'
      or existing_asset.source_metadata->>'unit_extra_item_id'<>session.unit_extra_item_id
      or existing_asset.source_metadata->>'asset_slot'<>session.asset_slot then
      raise exception 'unit extra managed asset identity conflicts with existing object';
    end if;
    created_asset_id:=existing_asset.id;
    reused_existing_asset:=true;
    if existing_asset.publication_status='archived' then
      update book_assets set publication_status='draft',source_metadata=source_metadata || jsonb_build_object('upload_session_id',session.id),updated_at=now()
      where id=existing_asset.id;
      reactivated_archived_asset:=true;
    end if;
  else
    insert into book_assets(
      book_package_id,edition_id,book_component_id,unit_id,page_id,activity_id,
      stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,
      byte_size,checksum_sha256,duration_seconds,edition_identifier,version,
      publication_status,access_level,source_metadata
    ) values (
      session.book_package_id,edition.id,session.book_component_id,session.unit_id,null,null,
      (select slug from book_packages where id=session.book_package_id)||'.builder-unit-extras.'||(select slug from units where id=session.unit_id)||'.'||session.unit_extra_item_id||'.'||left(requested_checksum,12),
      'unit_extra_video',requested_object_key,'private',requested_storage_bucket,'video/mp4',
      requested_byte_size,requested_checksum,requested_duration_ms::numeric/1000,'builder-draft','unit-extra-draft',
      'draft','internal',jsonb_build_object('unit_extra_item_id',session.unit_extra_item_id,'asset_slot',session.asset_slot,'unit_slug',(select slug from units where id=session.unit_id),'upload_session_id',session.id)
    ) returning id into created_asset_id;
  end if;
  update builder_unit_extra_asset_upload_sessions set state='completed',resulting_asset_id=created_asset_id,finalized_at=now(),updated_at=now() where id=session.id;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'unit_extra_asset_finalized','book_asset',created_asset_id::text,
    jsonb_build_object('unit_id',session.unit_id,'unit_extra_item_id',session.unit_extra_item_id,'asset_slot',session.asset_slot,
      'asset_role','unit_extra_video','reused_existing_asset',reused_existing_asset,'reactivated_archived_asset',reactivated_archived_asset));
  return created_asset_id;
end;
$$;

create or replace function fail_builder_unit_extra_asset_upload(requested_upload_id uuid, actor_builder_user_id uuid, requested_failure_code text)
returns boolean language plpgsql as $$
declare current_state text;
begin
  select state into current_state from builder_unit_extra_asset_upload_sessions where id=requested_upload_id and created_by_builder_user_id=actor_builder_user_id for update;
  if current_state='failed' then return true; end if;
  update builder_unit_extra_asset_upload_sessions set state='failed',failure_code=left(requested_failure_code,64),updated_at=now()
  where id=requested_upload_id and created_by_builder_user_id=actor_builder_user_id and state in ('prepared','finalizing');
  return found;
end;
$$;

create or replace function archive_unreferenced_builder_unit_extra_assets(requested_book_slug text, requested_component_slug text, actor_builder_user_id uuid)
returns table(asset_id uuid, object_key text) language plpgsql as $$
declare resolved_component_id uuid; current_payload jsonb;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then raise exception 'unauthorized Builder actor'; end if;
  select component.id into resolved_component_id from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null then return; end if;
  select payload into current_payload from builder_component_documents where book_component_id=resolved_component_id and document_type='unit_extras' and document_key='default';
  return query
  update book_assets asset set publication_status='archived',updated_at=now()
  where asset.book_component_id=resolved_component_id and asset.asset_role='unit_extra_video'
    and asset.publication_status='draft' and asset.storage_profile='private' and asset.access_level='internal'
    and not exists(
      select 1 from jsonb_array_elements(coalesce(current_payload->'units','[]'::jsonb)) unit_entry
      cross join lateral jsonb_array_elements(coalesce(unit_entry->'categories'->'videos','[]'::jsonb)) video_entry
      where video_entry->'asset'->>'assetId'=asset.id::text
    )
  returning asset.id,asset.object_key;
end;
$$;

drop trigger if exists set_builder_unit_extra_upload_updated_at on builder_unit_extra_asset_upload_sessions;
create trigger set_builder_unit_extra_upload_updated_at before update on builder_unit_extra_asset_upload_sessions
for each row execute function set_updated_at();

-- Preserve every historical publication-v2 compatibility variant. Only releases
-- whose snapshot explicitly includes Unit Extras participate in the new source check.
create or replace function builder_release_sources_are_current(requested_release_id uuid)
returns boolean language plpgsql volatile as $$
declare
  release_row book_component_releases%rowtype;
  activity_id text;
  expected jsonb;
  actual_revision bigint;
  actual_sha text;
begin
  select * into release_row from book_component_releases where id=requested_release_id;
  if release_row.id is null then return false; end if;
  if not (
    (release_row.compiler_id = 'ultimate-b2-students-book-v1' and release_row.release_schema_version = '1.0')
    or (release_row.compiler_id = 'ultimate-b2-students-book-v2' and release_row.release_schema_version = '2.0')
  ) then return false; end if;

  select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
  where book_component_id=release_row.book_component_id and document_type='hotspots' and document_key='default';
  expected:=release_row.source_snapshot->'hotspots';
  if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;

  actual_revision:=null; actual_sha:=null;
  select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
  where book_component_id=release_row.book_component_id and document_type='teacher_ui' and document_key='default';
  expected:=release_row.source_snapshot->'teacherUi';
  if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;

  for activity_id in select jsonb_object_keys(release_row.source_snapshot->'openResponse') loop
    expected:=release_row.source_snapshot->'openResponse'->activity_id->'document';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='open_response' and document_key=activity_id;
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;
    expected:=release_row.source_snapshot->'openResponse'->activity_id->'import';
    actual_revision:=null; actual_sha:=null;
    select revision,fingerprint_sha256 into actual_revision,actual_sha from builder_open_response_imports
    where book_component_id=release_row.book_component_id and activity_key=activity_id;
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or (actual_revision is not null and actual_sha<>expected->>'sha256') then return false; end if;
  end loop;

  if release_row.compiler_id='ultimate-b2-students-book-v1' then return true; end if;

  expected:=release_row.source_snapshot->'nativeIndex';
  actual_revision:=null; actual_sha:=null;
  select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
  where book_component_id=release_row.book_component_id and document_type='native_activity_index' and document_key='default';
  if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;

  for activity_id in select jsonb_object_keys(release_row.source_snapshot->'nativeActivities') loop
    expected:=release_row.source_snapshot->'nativeActivities'->activity_id->'public';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='native_activity_public' and document_key=activity_id;
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,'')<>expected->>'sha256' then return false; end if;
    expected:=release_row.source_snapshot->'nativeActivities'->activity_id->'teacher';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='native_activity_teacher' and document_key=activity_id;
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,'')<>expected->>'sha256' then return false; end if;
  end loop;

  if release_row.source_snapshot ? 'unitExtras' then
    expected:=release_row.source_snapshot->'unitExtras';
    actual_revision:=null; actual_sha:=null;
    select revision,payload_sha256 into actual_revision,actual_sha from builder_component_documents
    where book_component_id=release_row.book_component_id and document_type='unit_extras' and document_key='default';
    if coalesce(actual_revision,0)<>(expected->>'revision')::bigint or coalesce(actual_sha,expected->>'sha256')<>expected->>'sha256' then return false; end if;
  end if;
  return true;
end;
$$;
