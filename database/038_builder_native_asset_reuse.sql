-- Reuse one canonical managed asset when identical inspected bytes are finalized
-- more than once for the same native activity. Logical duplication belongs in
-- the native authoring document, while the physical object key remains unique.

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
    and asset.asset_role='activity_artwork'
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
      'activity_artwork',requested_object_key,'private',requested_storage_bucket,requested_mime_type,
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
      'asset_role','activity_artwork',
      'reused_existing_asset',reused_existing_asset
    )
  );

  return resolved_asset_id;
end;
$$;
