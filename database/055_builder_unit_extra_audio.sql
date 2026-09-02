-- Standalone managed MP3 Unit Extras. Existing video-only schema 1.0 documents
-- remain valid; normalized documents gain empty audio collections and visibility.

do $$ declare existing_check text;
begin
  select conname into existing_check from pg_constraint
  where conrelid='builder_unit_extra_asset_upload_sessions'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%unit_extra_item_id%' limit 1;
  if existing_check is not null then execute format('alter table builder_unit_extra_asset_upload_sessions drop constraint %I',existing_check); end if;
end $$;

alter table builder_unit_extra_asset_upload_sessions
  add constraint builder_unit_extra_upload_item_id_check
    check (unit_extra_item_id ~ '^(video|audio)-[a-f0-9]{32}$'),
  drop constraint builder_unit_extra_asset_upload_sessions_asset_slot_check,
  add constraint builder_unit_extra_asset_upload_sessions_asset_slot_check
    check (asset_slot ~ '^(video|audio)-[a-f0-9]{32}$');

alter table book_component_release_asset_pins
  drop constraint book_component_release_asset_pins_asset_role_check,
  add constraint book_component_release_asset_pins_asset_role_check
    check(asset_role in ('managed_page_image','activity_artwork','activity_font','unit_extra_video','unit_extra_audio')),
  drop constraint book_component_release_asset_pins_source_asset_role_check,
  add constraint book_component_release_asset_pins_source_asset_role_check
    check(source_asset_role in ('page_image','activity_artwork','activity_font','unit_extra_video','unit_extra_audio')),
  drop constraint book_component_release_asset_pins_media_type_check,
  add constraint book_component_release_asset_pins_media_type_check
    check(media_type in ('image/png','image/jpeg','image/webp','audio/mpeg','video/mp4','application/pdf','font/ttf')),
  drop constraint book_component_release_asset_pins_extension_check,
  add constraint book_component_release_asset_pins_extension_check
    check(extension in ('png','jpg','webp','mp3','mp4','pdf','ttf'));

create or replace function prepare_builder_unit_extra_asset_upload(
  requested_book_slug text, requested_component_slug text, requested_unit_slug text,
  requested_item_id text, requested_asset_slot text, requested_expected_revision bigint,
  requested_client_mutation_id uuid, requested_upload_id uuid, requested_request_sha256 text,
  requested_file_descriptor jsonb, requested_staging_object_key text,
  actor_builder_user_id uuid, requested_expires_at timestamptz
)
returns table(outcome text, upload_id uuid, current_revision bigint, session_state text, file_descriptor jsonb, staging_object_key text)
language plpgsql as $$
declare
  resolved_package_id uuid; resolved_component_id uuid; resolved_unit_id uuid;
  current_document builder_component_documents%rowtype;
  existing builder_unit_extra_asset_upload_sessions%rowtype;
  category_name text;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text,null::uuid,null::bigint,null::text,null::jsonb,null::text; return;
  end if;
  category_name:=case when requested_item_id ~ '^audio-' then 'audios' when requested_item_id ~ '^video-' then 'videos' else null end;
  if category_name is null then
    return query select 'unit_extra_item_mismatch'::text,null::uuid,null::bigint,null::text,null::jsonb,null::text; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','builder-unit-extra-upload',requested_book_slug,requested_component_slug,requested_unit_slug),0));
  select package.id,component.id,unit_record.id into resolved_package_id,resolved_component_id,resolved_unit_id
  from book_packages package
  join book_components component on component.book_package_id=package.id
  join units unit_record on unit_record.book_component_id=component.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug
    and component.slug='ultimate-b2-students-book' and unit_record.slug=requested_unit_slug limit 1;
  if resolved_unit_id is null then
    return query select 'resource_not_found'::text,null::uuid,null::bigint,null::text,null::jsonb,null::text; return;
  end if;
  select * into current_document from builder_component_documents
  where book_component_id=resolved_component_id and document_type='unit_extras' and document_key='default' for update;
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
    select 1 from jsonb_array_elements(coalesce(current_document.payload->'units','[]'::jsonb)) unit_entry
    cross join lateral jsonb_array_elements(coalesce(unit_entry->'categories'->category_name,'[]'::jsonb)) media_entry
    where unit_entry->>'unitId'=requested_unit_slug and media_entry->>'id'=requested_item_id
      and media_entry->>'assetSlot'=requested_asset_slot
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
end $$;

create or replace function claim_builder_unit_extra_asset_upload(
  requested_upload_id uuid, requested_expected_revision bigint,
  requested_client_mutation_id uuid, actor_builder_user_id uuid
)
returns table(outcome text, book_package_id uuid, book_component_id uuid, unit_id uuid, unit_slug text, unit_extra_item_id text, asset_slot text, current_revision bigint, file_descriptor jsonb, staging_object_key text, resulting_asset_id uuid)
language plpgsql as $$
declare
  session builder_unit_extra_asset_upload_sessions%rowtype;
  current_document builder_component_documents%rowtype;
  resolved_unit_slug text; category_name text;
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
  where document.book_component_id=session.book_component_id and document.document_type='unit_extras' and document.document_key='default' for update;
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
  category_name:=case when session.unit_extra_item_id ~ '^audio-' then 'audios' else 'videos' end;
  if resolved_unit_slug is null or not exists(
    select 1 from jsonb_array_elements(coalesce(current_document.payload->'units','[]'::jsonb)) unit_entry
    cross join lateral jsonb_array_elements(coalesce(unit_entry->'categories'->category_name,'[]'::jsonb)) media_entry
    where unit_entry->>'unitId'=resolved_unit_slug and media_entry->>'id'=session.unit_extra_item_id
      and media_entry->>'assetSlot'=session.asset_slot
  ) then
    return query select 'unit_extra_item_mismatch'::text,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text,current_document.revision,null::jsonb,null::text,null::uuid; return;
  end if;
  update builder_unit_extra_asset_upload_sessions set state='finalizing',updated_at=now() where id=session.id;
  return query select 'claimed'::text,session.book_package_id,session.book_component_id,session.unit_id,resolved_unit_slug,session.unit_extra_item_id,session.asset_slot,current_document.revision,session.file_descriptor,session.staging_object_key,null::uuid;
end $$;

create or replace function complete_builder_unit_extra_asset_upload(
  requested_upload_id uuid, actor_builder_user_id uuid, requested_object_key text,
  requested_storage_bucket text, requested_mime_type text, requested_byte_size bigint,
  requested_checksum text, requested_duration_ms bigint
)
returns uuid language plpgsql as $$
declare
  session builder_unit_extra_asset_upload_sessions%rowtype; edition book_editions%rowtype;
  created_asset_id uuid; existing_asset book_assets%rowtype;
  reused_existing_asset boolean:=false; reactivated_archived_asset boolean:=false;
  resolved_role text; resolved_mime text; resolved_duration numeric(12,3);
begin
  select * into session from builder_unit_extra_asset_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id or session.state<>'finalizing' then raise exception 'unit extra upload session cannot be completed'; end if;
  resolved_role:=case when session.unit_extra_item_id ~ '^audio-' then 'unit_extra_audio' else 'unit_extra_video' end;
  resolved_mime:=case when resolved_role='unit_extra_audio' then 'audio/mpeg' else 'video/mp4' end;
  resolved_duration:=case when resolved_role='unit_extra_video' then requested_duration_ms::numeric/1000 else null end;
  if requested_mime_type<>resolved_mime or requested_byte_size<1 or requested_checksum!~'^[a-f0-9]{64}$'
    or (resolved_role='unit_extra_video' and coalesce(requested_duration_ms,0)<1)
    or (resolved_role='unit_extra_audio' and requested_duration_ms is not null) then raise exception 'unit extra upload media metadata is invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-unit-extra-assets:'||session.book_component_id::text||':'||session.unit_id::text,0));
  insert into book_editions(book_package_id,edition_identifier,title,status,source_metadata)
  values(session.book_package_id,'builder-draft','Builder Unit Extra draft assets','draft','{"source":"unit-extras-builder"}'::jsonb)
  on conflict(book_package_id,edition_identifier) do update set updated_at=now() returning * into edition;
  select * into existing_asset from book_assets where storage_bucket=requested_storage_bucket and object_key=requested_object_key limit 1;
  if existing_asset.id is not null then
    if existing_asset.book_package_id<>session.book_package_id or existing_asset.book_component_id<>session.book_component_id
      or existing_asset.unit_id<>session.unit_id or existing_asset.activity_id is not null or existing_asset.page_id is not null
      or existing_asset.asset_role<>resolved_role or existing_asset.mime_type<>resolved_mime
      or existing_asset.byte_size<>requested_byte_size or existing_asset.checksum_sha256<>requested_checksum
      or existing_asset.duration_seconds is distinct from resolved_duration
      or existing_asset.publication_status not in ('draft','archived') or existing_asset.storage_profile<>'private' or existing_asset.access_level<>'internal'
      or existing_asset.source_metadata->>'unit_extra_item_id'<>session.unit_extra_item_id
      or existing_asset.source_metadata->>'asset_slot'<>session.asset_slot then raise exception 'unit extra managed asset identity conflicts with existing object'; end if;
    created_asset_id:=existing_asset.id; reused_existing_asset:=true;
    if existing_asset.publication_status='archived' then
      update book_assets set publication_status='draft',source_metadata=source_metadata||jsonb_build_object('upload_session_id',session.id),updated_at=now() where id=existing_asset.id;
      reactivated_archived_asset:=true;
    end if;
  else
    insert into book_assets(book_package_id,edition_id,book_component_id,unit_id,page_id,activity_id,stable_logical_key,asset_role,
      object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,duration_seconds,edition_identifier,
      version,publication_status,access_level,source_metadata)
    values(session.book_package_id,edition.id,session.book_component_id,session.unit_id,null,null,
      (select slug from book_packages where id=session.book_package_id)||'.builder-unit-extras.'||(select slug from units where id=session.unit_id)||'.'||session.unit_extra_item_id||'.'||left(requested_checksum,12),
      resolved_role,requested_object_key,'private',requested_storage_bucket,resolved_mime,requested_byte_size,requested_checksum,
      resolved_duration,'builder-draft','unit-extra-draft','draft','internal',jsonb_build_object('unit_extra_item_id',session.unit_extra_item_id,'asset_slot',session.asset_slot,'unit_slug',(select slug from units where id=session.unit_id),'upload_session_id',session.id)) returning id into created_asset_id;
  end if;
  update builder_unit_extra_asset_upload_sessions set state='completed',resulting_asset_id=created_asset_id,finalized_at=now(),updated_at=now() where id=session.id;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'unit_extra_asset_finalized','book_asset',created_asset_id::text,jsonb_build_object('unit_id',session.unit_id,'unit_extra_item_id',session.unit_extra_item_id,'asset_slot',session.asset_slot,'asset_role',resolved_role,'reused_existing_asset',reused_existing_asset,'reactivated_archived_asset',reactivated_archived_asset));
  return created_asset_id;
end $$;

create or replace function archive_unreferenced_builder_unit_extra_assets(requested_book_slug text, requested_component_slug text, actor_builder_user_id uuid)
returns table(asset_id uuid, object_key text) language plpgsql as $$
declare resolved_component_id uuid; current_payload jsonb;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then raise exception 'unauthorized Builder actor'; end if;
  select component.id into resolved_component_id from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null then return; end if;
  select payload into current_payload from builder_component_documents where book_component_id=resolved_component_id and document_type='unit_extras' and document_key='default';
  return query update book_assets asset set publication_status='archived',updated_at=now()
  where asset.book_component_id=resolved_component_id and asset.asset_role in ('unit_extra_video','unit_extra_audio')
    and asset.publication_status='draft' and asset.storage_profile='private' and asset.access_level='internal'
    and not exists(select 1 from book_component_release_asset_pins pin where pin.book_asset_id=asset.id)
    and not exists(
      select 1 from jsonb_array_elements(coalesce(current_payload->'units','[]'::jsonb)) unit_entry
      cross join lateral jsonb_array_elements(
        coalesce(unit_entry->'categories'->(case when asset.asset_role='unit_extra_audio' then 'audios' else 'videos' end),'[]'::jsonb)
      ) media_entry where media_entry->'asset'->>'assetId'=asset.id::text
    ) returning asset.id,asset.object_key;
end $$;

create or replace function validate_builder_release_asset_pin()
returns trigger language plpgsql as $$
declare
  release_row book_component_releases%rowtype; asset_row book_assets%rowtype;
  package_slug text; component_slug text; page_key text; unit_slug text;
  expected_key text; expected_source_role text; unit_extension text; unit_mime text;
begin
  select * into release_row from book_component_releases where id=new.component_release_id;
  select * into asset_row from book_assets where id=new.book_asset_id;
  select package.slug,component.slug into package_slug,component_slug from book_packages package
  join book_components component on component.book_package_id=package.id
  where package.id=new.book_package_id and component.id=new.book_component_id;
  if release_row.id is null or asset_row.id is null or package_slug is null or release_row.asset_storage_mode<>'pinned-source-v1'
    or release_row.book_package_id<>new.book_package_id or release_row.book_component_id<>new.book_component_id
    or asset_row.book_package_id<>new.book_package_id or asset_row.book_component_id<>new.book_component_id
  then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  expected_source_role:=case when new.asset_role='managed_page_image' then 'page_image' else new.asset_role end;
  if new.source_asset_role<>expected_source_role or asset_row.asset_role<>expected_source_role
    or asset_row.checksum_sha256<>new.checksum_sha256 or asset_row.byte_size<>new.byte_size
    or asset_row.mime_type<>new.media_type or asset_row.storage_profile<>new.storage_profile
    or asset_row.storage_bucket<>new.storage_bucket or asset_row.object_key<>new.object_key
    or asset_row.publication_status<>'draft' or asset_row.access_level<>'internal'
    or new.pin_sha256<>builder_release_asset_pin_sha256(new.book_asset_id,new.asset_role,new.source_asset_role,new.checksum_sha256,new.byte_size,new.media_type,new.extension,new.storage_profile,new.storage_bucket,new.object_key,new.source_owner_key,new.source_asset_slot)
    or not exists(select 1 from jsonb_array_elements(release_row.asset_manifest) descriptor where descriptor->>'sha256'=new.checksum_sha256 and descriptor->>'extension'=new.extension and descriptor->>'mediaType'=new.media_type and descriptor->>'role'=new.asset_role)
  then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  if new.asset_role='managed_page_image' then
    select stable_key into page_key from book_pages where id=asset_row.page_id and book_component_id=new.book_component_id;
    expected_key:='builder-page-assets/'||package_slug||'/'||component_slug||'/'||new.source_owner_key||'/assets/'||new.checksum_sha256||'.'||new.extension;
    if page_key<>component_slug||'/pages/'||new.source_owner_key or new.source_asset_slot<>'' or new.object_key<>expected_key then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  elsif new.asset_role='activity_font' then
    expected_key:='builder-font-library/'||package_slug||'/'||component_slug||'/'||new.checksum_sha256||'.ttf';
    if new.media_type<>'font/ttf' or new.extension<>'ttf' or new.source_owner_key<>'component' or new.source_asset_slot<>''
      or asset_row.unit_id is not null or asset_row.page_id is not null or asset_row.activity_id is not null
      or asset_row.source_metadata->>'font_library_scope'<>'component' or new.object_key<>expected_key
    then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  elsif new.asset_role in ('unit_extra_video','unit_extra_audio') then
    unit_extension:=case when new.asset_role='unit_extra_audio' then 'mp3' else 'mp4' end;
    unit_mime:=case when new.asset_role='unit_extra_audio' then 'audio/mpeg' else 'video/mp4' end;
    select slug into unit_slug from units where id=asset_row.unit_id and book_component_id=new.book_component_id;
    expected_key:='builder-unit-extra-assets/'||package_slug||'/'||component_slug||'/'||unit_slug||'/'||new.source_owner_key||'/assets/'||new.checksum_sha256||'.'||unit_extension;
    if new.media_type<>unit_mime or new.extension<>unit_extension or asset_row.page_id is not null or asset_row.activity_id is not null
      or asset_row.source_metadata->>'unit_extra_item_id'<>new.source_owner_key or asset_row.source_metadata->>'asset_slot'<>new.source_asset_slot
      or new.source_asset_slot<>new.source_owner_key or asset_row.source_metadata->>'unit_slug'<>unit_slug or new.object_key<>expected_key
    then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  else
    expected_key:='builder-native-assets/'||package_slug||'/'||component_slug||'/'||new.source_owner_key||'/assets/'||case when new.extension in ('mp3','mp4') then new.source_asset_slot||'/' else '' end||new.checksum_sha256||'.'||new.extension;
    if asset_row.source_metadata->>'native_activity_id'<>new.source_owner_key or asset_row.source_metadata->>'asset_slot'<>new.source_asset_slot or new.object_key<>expected_key
    then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  end if;
  return new;
end $$;

create or replace function create_builder_pinned_product_release(
  requested_product_release_id uuid,requested_book_slug text,requested_release_schema_version text,requested_compiler_id text,
  requested_members jsonb,requested_request_sha256 text,requested_release_note text,actor_builder_user_id uuid,requested_client_mutation_id uuid
)
returns table(outcome text,product_release_id uuid,product_release_number bigint,source_snapshot_sha256 text,release_sha256 text,members jsonb)
language plpgsql as $$
declare result record; member jsonb; pin jsonb; private_count int; pin_count int; duplicate_count int; existing_count int; replay_release_id uuid;
begin
  if jsonb_typeof(requested_members)<>'array' then return query select 'invalid_request',null::uuid,null::bigint,null::text,null::text,null::jsonb; return; end if;
  for member in select value from jsonb_array_elements(requested_members) loop
    if member->>'assetStorageMode'<>'pinned-source-v1' or jsonb_typeof(member->'assetPins')<>'array' then return query select 'invalid_request',null::uuid,null::bigint,null::text,null::text,null::jsonb; return; end if;
    select count(*) into private_count from jsonb_array_elements(member->'assetManifest') descriptor
      where descriptor->>'role' in ('managed_page_image','activity_artwork','activity_font','unit_extra_video','unit_extra_audio');
    pin_count:=jsonb_array_length(member->'assetPins');
    select count(*)-count(distinct concat_ws('.',value->>'checksumSha256',value->>'extension',value->>'role')) into duplicate_count from jsonb_array_elements(member->'assetPins');
    if private_count<>pin_count or duplicate_count<>0 or exists(select 1 from jsonb_array_elements(member->'assetPins') candidate where not exists(select 1 from jsonb_array_elements(member->'assetManifest') descriptor where descriptor->>'sha256'=candidate->>'checksumSha256' and descriptor->>'extension'=candidate->>'extension' and descriptor->>'mediaType'=candidate->>'mediaType' and descriptor->>'role'=candidate->>'role')) then raise exception using errcode='PZ003',message='release_pin_conflict'; end if;
  end loop;
  perform set_config('hhplms.release_asset_storage_mode','pinned-source-v1',true);
  select * into result from create_builder_product_release(requested_product_release_id,requested_book_slug,requested_release_schema_version,requested_compiler_id,requested_members,requested_request_sha256,requested_release_note,actor_builder_user_id,requested_client_mutation_id);
  perform set_config('hhplms.release_asset_storage_mode','',true);
  if result.outcome='created' then
    for member in select value from jsonb_array_elements(requested_members) loop for pin in select value from jsonb_array_elements(member->'assetPins') loop
      insert into book_component_release_asset_pins(component_release_id,book_package_id,book_component_id,book_asset_id,asset_role,source_asset_role,checksum_sha256,byte_size,media_type,extension,storage_profile,storage_bucket,object_key,source_owner_key,source_asset_slot,pin_sha256)
      select release.id,release.book_package_id,release.book_component_id,(pin->>'assetId')::uuid,pin->>'role',pin->>'sourceAssetRole',pin->>'checksumSha256',(pin->>'byteSize')::bigint,pin->>'mediaType',pin->>'extension',pin->>'storageProfile',pin->>'storageBucket',pin->>'objectKey',pin->>'ownerKey',pin->>'assetSlot',pin->>'pinSha256' from book_component_releases release where release.id=(member->>'releaseId')::uuid;
      if not found then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
    end loop; end loop;
  elsif result.outcome='idempotent' then
    for member in select value from jsonb_array_elements(requested_members) loop
      select family_member.component_release_id into replay_release_id from book_product_release_members family_member join book_components component on component.id=family_member.book_component_id where family_member.product_release_id=result.product_release_id and component.slug=member->>'componentSlug';
      select count(*) into existing_count from book_component_release_asset_pins where component_release_id=replay_release_id;
      if existing_count<>jsonb_array_length(member->'assetPins') or exists(select 1 from jsonb_array_elements(member->'assetPins') candidate where not exists(select 1 from book_component_release_asset_pins stored where stored.component_release_id=replay_release_id and stored.pin_sha256=candidate->>'pinSha256')) then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
    end loop;
  end if;
  return query select result.outcome,result.product_release_id,result.product_release_number,result.source_snapshot_sha256,result.release_sha256,result.members;
end $$;
