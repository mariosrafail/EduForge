-- Component-scoped, private Builder TTF library. Font bytes are immutable and
-- deduplicated by SHA-256 within the authorized book component.

alter table book_assets drop constraint book_assets_mime_type_check;
alter table book_assets add constraint book_assets_mime_type_check check (
  mime_type in ('image/jpeg','image/png','image/webp','image/svg+xml','audio/mpeg','audio/mp4','video/mp4','application/pdf','application/zip','application/json','font/ttf')
);

create table if not exists builder_font_upload_sessions (
  id uuid primary key,
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
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
  unique(book_component_id,client_mutation_id),
  constraint builder_font_upload_component_package_fk foreign key(book_component_id,book_package_id) references book_components(id,book_package_id) on delete cascade
);
create index if not exists builder_font_upload_expiry_idx on builder_font_upload_sessions(state,expires_at);

create or replace function prepare_builder_font_upload(
  requested_book_slug text,requested_component_slug text,requested_client_mutation_id uuid,requested_upload_id uuid,
  requested_request_sha256 text,requested_file_descriptor jsonb,requested_staging_object_key text,
  actor_builder_user_id uuid,requested_expires_at timestamptz
)
returns table(outcome text,upload_id uuid,session_state text,file_descriptor jsonb,staging_object_key text)
language plpgsql as $$
declare resolved_package_id uuid; resolved_component_id uuid; existing builder_font_upload_sessions%rowtype;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::uuid,null::text,null::jsonb,null::text; return; end if;
  select package.id,component.id into resolved_package_id,resolved_component_id
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_component_id is null then return query select 'resource_not_found',null::uuid,null::text,null::jsonb,null::text; return; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-font-library:'||resolved_component_id::text,0));
  select * into existing from builder_font_upload_sessions where book_component_id=resolved_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.id is not null then
    if existing.request_sha256<>requested_request_sha256 then return query select 'mutation_id_conflict',existing.id,existing.state,null::jsonb,null::text;
    else return query select 'idempotent',existing.id,existing.state,existing.file_descriptor,existing.staging_object_key; end if; return;
  end if;
  insert into builder_font_upload_sessions(id,book_package_id,book_component_id,client_mutation_id,request_sha256,file_descriptor,staging_object_key,created_by_builder_user_id,expires_at)
  values(requested_upload_id,resolved_package_id,resolved_component_id,requested_client_mutation_id,requested_request_sha256,requested_file_descriptor,requested_staging_object_key,actor_builder_user_id,requested_expires_at);
  return query select 'prepared',requested_upload_id,'prepared',requested_file_descriptor,requested_staging_object_key;
end $$;

create or replace function claim_builder_font_upload(requested_upload_id uuid,requested_client_mutation_id uuid,actor_builder_user_id uuid)
returns table(outcome text,book_package_id uuid,book_component_id uuid,file_descriptor jsonb,staging_object_key text,resulting_asset_id uuid)
language plpgsql as $$
declare session builder_font_upload_sessions%rowtype;
begin
  select * into session from builder_font_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id then return query select 'session_not_found',null::uuid,null::uuid,null::jsonb,null::text,null::uuid; return; end if;
  if session.client_mutation_id<>requested_client_mutation_id then return query select 'session_identity_conflict',null::uuid,null::uuid,null::jsonb,null::text,null::uuid; return; end if;
  if session.state='completed' then return query select 'idempotent',session.book_package_id,session.book_component_id,session.file_descriptor,session.staging_object_key,session.resulting_asset_id; return; end if;
  if session.state<>'prepared' then return query select 'invalid_session_state',null::uuid,null::uuid,null::jsonb,null::text,null::uuid; return; end if;
  if session.expires_at<=now() then update builder_font_upload_sessions set state='failed',failure_code='expired_session',updated_at=now() where id=session.id; return query select 'expired_session',null::uuid,null::uuid,null::jsonb,null::text,null::uuid; return; end if;
  update builder_font_upload_sessions set state='finalizing',updated_at=now() where id=session.id;
  return query select 'claimed',session.book_package_id,session.book_component_id,session.file_descriptor,session.staging_object_key,null::uuid;
end $$;

create or replace function complete_builder_font_upload(
  requested_upload_id uuid,actor_builder_user_id uuid,requested_object_key text,requested_storage_bucket text,
  requested_mime_type text,requested_byte_size bigint,requested_checksum text,requested_display_label text,requested_original_filename text
)
returns uuid language plpgsql as $$
declare session builder_font_upload_sessions%rowtype; edition book_editions%rowtype; resolved_asset_id uuid; reused boolean:=false;
begin
  select * into session from builder_font_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id or session.state<>'finalizing' then raise exception 'font upload session cannot be completed'; end if;
  if requested_mime_type<>'font/ttf' or requested_byte_size<1 or requested_byte_size>12582912 or requested_checksum!~'^[a-f0-9]{64}$'
    or char_length(requested_display_label) not between 1 and 120 or requested_display_label~'[[:cntrl:]]'
    or requested_original_filename!~'^[A-Za-z0-9][A-Za-z0-9._() -]{0,179}\.ttf$' then raise exception 'font upload metadata is invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('builder-font-library:'||session.book_component_id::text,0));
  insert into book_editions(book_package_id,edition_identifier,title,status,source_metadata)
  values(session.book_package_id,'builder-draft','Builder native draft assets','draft','{"source":"native-activity-builder"}'::jsonb)
  on conflict(book_package_id,edition_identifier) do update set updated_at=now() returning * into edition;
  select asset.id into resolved_asset_id from book_assets asset
  where asset.book_package_id=session.book_package_id and asset.book_component_id=session.book_component_id
    and asset.asset_role='activity_font' and asset.mime_type='font/ttf' and asset.checksum_sha256=requested_checksum
    and asset.byte_size=requested_byte_size and asset.object_key=requested_object_key and asset.storage_bucket=requested_storage_bucket
    and asset.publication_status='draft' and asset.storage_profile='private' and asset.access_level='internal'
    and asset.source_metadata->>'font_library_scope'='component' limit 1;
  if resolved_asset_id is not null then reused:=true;
  else
    if exists(select 1 from book_assets where storage_bucket=requested_storage_bucket and object_key=requested_object_key) then raise exception 'font object identity conflicts with an existing managed asset'; end if;
    insert into book_assets(book_package_id,edition_id,book_component_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,width,height,edition_identifier,version,publication_status,access_level,source_metadata)
    values(session.book_package_id,edition.id,session.book_component_id,(select package.slug||'.builder-font.'||component.slug||'.'||left(requested_checksum,12) from book_packages package join book_components component on component.id=session.book_component_id where package.id=session.book_package_id),
      'activity_font',requested_object_key,'private',requested_storage_bucket,'font/ttf',requested_byte_size,requested_checksum,null,null,'builder-draft','font-library','draft','internal',
      jsonb_build_object('font_library_scope','component','display_label',requested_display_label,'original_filename',requested_original_filename,'upload_session_id',session.id))
    returning id into resolved_asset_id;
  end if;
  update builder_font_upload_sessions set state='completed',resulting_asset_id=resolved_asset_id,updated_at=now() where id=session.id;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'builder_font_finalized','book_asset',resolved_asset_id::text,jsonb_build_object('scope','component','reused_existing_asset',reused));
  return resolved_asset_id;
end $$;

create or replace function fail_builder_font_upload(requested_upload_id uuid,actor_builder_user_id uuid,requested_failure_code text)
returns boolean language plpgsql as $$
begin
  update builder_font_upload_sessions set state='failed',failure_code=requested_failure_code,updated_at=now()
  where id=requested_upload_id and created_by_builder_user_id=actor_builder_user_id and state in ('prepared','finalizing');
  return found;
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
    select count(*) into private_count from jsonb_array_elements(member->'assetManifest') descriptor where descriptor->>'role' in ('managed_page_image','activity_artwork','activity_font','unit_extra_video');
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
