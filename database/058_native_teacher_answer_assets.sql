-- Protected raster Sample answers. Existing public artwork and pinned releases retain their identities.
begin;

alter table book_component_release_asset_pins
  drop constraint book_component_release_asset_pins_asset_role_check,
  add constraint book_component_release_asset_pins_asset_role_check check(asset_role in ('managed_page_image','activity_artwork','activity_font','unit_extra_video','unit_extra_audio','native_teacher_answer')),
  drop constraint book_component_release_asset_pins_source_asset_role_check,
  add constraint book_component_release_asset_pins_source_asset_role_check check(source_asset_role in ('page_image','activity_artwork','activity_font','unit_extra_video','unit_extra_audio','native_teacher_answer'));

create or replace function complete_builder_native_asset_upload(
  requested_upload_id uuid, actor_builder_user_id uuid, requested_object_key text, requested_storage_bucket text,
  requested_mime_type text, requested_byte_size bigint, requested_checksum text, requested_width int, requested_height int
)
returns uuid language plpgsql as $$
declare
  session builder_native_asset_upload_sessions%rowtype;
  edition book_editions%rowtype;
  resolved_asset_id uuid;
  resolved_asset_slot text;
  reused_existing_asset boolean := false;
  resolved_role text;
  expected_answer_key text;
begin
  select * into session
  from builder_native_asset_upload_sessions
  where id=requested_upload_id
  for update;

  if session.id is null
    or session.created_by_builder_user_id<>actor_builder_user_id
    or session.state<>'finalizing'
  then
    raise exception 'native upload session cannot be completed';
  end if;

  resolved_role := case when session.file_descriptor->>'purpose'='teacher-answer' then 'native_teacher_answer' else 'activity_artwork' end;
  if resolved_role='native_teacher_answer' then
    select 'builder-native-assets/'||package.slug||'/'||component.slug||'/'||session.activity_id||'/assets/teacher-answers/'||requested_checksum||
      case requested_mime_type when 'image/png' then '.png' when 'image/jpeg' then '.jpg' when 'image/webp' then '.webp' else '' end
      into expected_answer_key from book_packages package join book_components component on component.book_package_id=package.id
      where package.id=session.book_package_id and component.id=session.book_component_id;
    if requested_mime_type not in ('image/png','image/jpeg','image/webp') or requested_width is null or requested_height is null
      or requested_width not between 1 and 8192 or requested_height not between 1 and 8192
      or requested_object_key is distinct from expected_answer_key then raise exception 'invalid protected native answer asset'; end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('builder-native-assets:' || session.book_component_id::text || ':' || session.activity_id,0)
  );

  insert into book_editions(book_package_id,edition_identifier,title,status,source_metadata)
  values(session.book_package_id,'builder-draft','Builder native draft assets','draft','{"source":"native-activity-builder"}'::jsonb)
  on conflict(book_package_id,edition_identifier) do update set updated_at=now()
  returning * into edition;

  select asset.id, asset.source_metadata->>'asset_slot'
  into resolved_asset_id, resolved_asset_slot
  from book_assets asset
  where asset.book_package_id=session.book_package_id
    and asset.book_component_id=session.book_component_id
    and asset.storage_bucket=requested_storage_bucket
    and asset.object_key=requested_object_key
    and asset.checksum_sha256=requested_checksum
    and asset.mime_type=requested_mime_type
    and asset.byte_size=requested_byte_size
    and asset.width=requested_width
    and asset.height=requested_height
    and asset.asset_role=resolved_role
    and asset.publication_status='draft'
    and asset.storage_profile='private'
    and asset.access_level='internal'
    and asset.source_metadata->>'native_activity_id'=session.activity_id
    and asset.source_metadata->>'asset_slot' ~ '^[a-z0-9][a-z0-9-]{0,127}$'
  limit 1;

  if resolved_asset_id is not null then
    reused_existing_asset := true;
  else
    -- An occupied physical identity that is not an exact, in-scope reusable
    -- native asset is a security/integrity conflict, never an implicit reuse.
    if exists (
      select 1 from book_assets asset
      where asset.storage_bucket=requested_storage_bucket
        and asset.object_key=requested_object_key
    ) then
      raise exception 'native asset object identity conflicts with an existing managed asset';
    end if;

    insert into book_assets(
      book_package_id,edition_id,book_component_id,stable_logical_key,asset_role,object_key,
      storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,width,height,
      edition_identifier,version,publication_status,access_level,source_metadata
    )
    values(
      session.book_package_id,edition.id,session.book_component_id,
      (select slug from book_packages where id=session.book_package_id)||'.builder-native.'||session.activity_id||'.'||session.asset_slot||'.'||left(requested_checksum,12),
      resolved_role,requested_object_key,'private',requested_storage_bucket,requested_mime_type,
      requested_byte_size,requested_checksum,requested_width,requested_height,
      'builder-draft','native-draft','draft','internal',
      jsonb_build_object('native_activity_id',session.activity_id,'asset_slot',session.asset_slot,'upload_session_id',session.id)
    )
    returning id into resolved_asset_id;
    resolved_asset_slot := session.asset_slot;
  end if;

  update builder_native_asset_upload_sessions
  set state='completed',resulting_asset_id=resolved_asset_id,updated_at=now()
  where id=session.id;

  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(
    actor_builder_user_id,'native_activity_asset_finalized','book_asset',resolved_asset_id::text,
    jsonb_build_object(
      'native_activity_id',session.activity_id,
      'requested_asset_slot',session.asset_slot,
      'resolved_asset_slot',resolved_asset_slot,
      'asset_role',resolved_role,
      'reused_existing_asset',reused_existing_asset
    )
  );

  return resolved_asset_id;
end;
$$;

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
    expected_key:='builder-native-assets/'||package_slug||'/'||component_slug||'/'||new.source_owner_key||'/assets/'||case when new.asset_role='native_teacher_answer' then 'teacher-answers/' when new.extension in ('mp3','mp4') then new.source_asset_slot||'/' else '' end||new.checksum_sha256||'.'||new.extension;
    if asset_row.source_metadata->>'native_activity_id'<>new.source_owner_key or asset_row.source_metadata->>'asset_slot'<>new.source_asset_slot or new.object_key<>expected_key
    then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  end if;
  if new.asset_role='native_teacher_answer' then
    if new.media_type not in ('image/png','image/jpeg','image/webp') or new.extension not in ('png','jpg','webp')
      or not exists (
        select 1 from jsonb_each(release_row.teacher_projection->'nativeActivities') entry,
          lateral jsonb_path_query(entry.value, '$.document.parts[*].solution.**.sampleAnswer.image.reference') ref
        where entry.key=new.source_owner_key and ref->>'assetId'=new.book_asset_id::text
          and ref->>'slot'=new.source_asset_slot and ref->>'checksumSha256'=new.checksum_sha256 and ref->>'role'='native_teacher_answer'
      ) then raise exception using errcode='PZ001',message='release_pin_integrity_failed'; end if;
  end if;
  return new;
end $$;

create function builder_native_teacher_answer_assets_version() returns integer language sql immutable as $$ select 1 $$;

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
      where descriptor->>'role' in ('managed_page_image','activity_artwork','activity_font','unit_extra_video','unit_extra_audio','native_teacher_answer');
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

commit;
