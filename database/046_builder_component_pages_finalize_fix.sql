-- Repair PL/pgSQL RETURNS TABLE identifier collisions in page upload
-- finalization while preserving the existing function contract and behavior.

create or replace function complete_builder_component_page_upload(
  requested_upload_id uuid,actor_builder_user_id uuid,requested_object_key text,requested_storage_bucket text,
  requested_mime_type text,requested_byte_size bigint,requested_checksum text,requested_width int,requested_height int
)
returns table(outcome text,page_id uuid,asset_id uuid,revision bigint) language plpgsql as $$
declare session builder_component_page_upload_sessions%rowtype; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype;
  edition book_editions%rowtype; created_asset_id uuid; package_slug text; component_slug text; page_slug text; student_component boolean;
begin
  select upload_session.* into session
  from builder_component_page_upload_sessions as upload_session
  where upload_session.id=requested_upload_id
  for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id or session.state<>'finalizing' then raise exception 'page upload session cannot be completed'; end if;
  if requested_mime_type not in ('image/png','image/jpeg','image/webp') or requested_byte_size<1 or requested_checksum!~'^[a-f0-9]{64}$' or requested_width<1 or requested_height<1 then raise exception 'page upload metadata is invalid'; end if;
  select book_package.slug,component.slug into package_slug,component_slug
  from book_packages as book_package
  join book_components as component on component.book_package_id=book_package.id
  where component.id=session.book_component_id;
  student_component:=component_slug='ultimate-b2-students-book';
  page_slug:=substring(session.page_key from char_length(component_slug)+8);
  select page_revision.* into revision_row
  from builder_component_page_revisions as page_revision
  where page_revision.book_component_id=session.book_component_id
  for update;
  if revision_row.revision<>session.expected_revision then raise exception 'page revision changed during finalize'; end if;
  select component_page.* into page_row
  from book_pages as component_page
  where component_page.book_component_id=session.book_component_id and component_page.stable_key=session.page_key
  for update;
  if page_row.id is null then
    insert into book_pages as created_page(book_package_id,book_component_id,unit_id,stable_key,label,sort_order,source_metadata)
    values(session.book_package_id,session.book_component_id,null,session.page_key,session.page_metadata->>'label',(session.page_metadata->>'sortOrder')::int,
      jsonb_build_object('source','builder-pages','is_override',student_component,'is_active',not student_component,'printed_label',coalesce(session.page_metadata->>'printedLabel',''),'original_filename',session.file_descriptor->>'name'))
    returning created_page.* into page_row;
  else
    update book_pages as updated_page
    set label=session.page_metadata->>'label',sort_order=(session.page_metadata->>'sortOrder')::int,
      source_metadata=updated_page.source_metadata||jsonb_build_object('source','builder-pages','is_override',student_component,'is_active',not student_component,'printed_label',coalesce(session.page_metadata->>'printedLabel',''),'original_filename',session.file_descriptor->>'name'),updated_at=now()
    where updated_page.id=page_row.id
    returning updated_page.* into page_row;
  end if;
  insert into book_editions as page_edition(book_package_id,edition_identifier,title,status,source_metadata)
  values(session.book_package_id,'builder-pages','Builder page assets','draft','{"source":"builder-pages"}'::jsonb)
  on conflict(book_package_id,edition_identifier) do update set updated_at=now()
  returning page_edition.* into edition;
  update book_assets as page_asset
  set publication_status='archived',updated_at=now()
  where page_asset.page_id=page_row.id and page_asset.asset_role='page_image' and page_asset.publication_status='draft';
  select existing_asset.id into created_asset_id
  from book_assets as existing_asset
  where existing_asset.storage_bucket=requested_storage_bucket and existing_asset.object_key=requested_object_key;
  if created_asset_id is not null then
    update book_assets as managed_asset
    set publication_status='draft',updated_at=now()
    where managed_asset.id=created_asset_id
      and managed_asset.book_package_id=session.book_package_id and managed_asset.book_component_id=session.book_component_id and managed_asset.page_id=page_row.id
      and managed_asset.asset_role='page_image' and managed_asset.mime_type=requested_mime_type and managed_asset.byte_size=requested_byte_size and managed_asset.checksum_sha256=requested_checksum
      and managed_asset.width=requested_width and managed_asset.height=requested_height and managed_asset.storage_profile='private' and managed_asset.access_level='internal';
    if not found then raise exception 'page managed asset identity conflict'; end if;
  else
    insert into book_assets as created_asset(book_package_id,edition_id,book_component_id,unit_id,page_id,activity_id,stable_logical_key,asset_role,
      object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,width,height,edition_identifier,version,publication_status,access_level,source_metadata)
    values(session.book_package_id,edition.id,session.book_component_id,null,page_row.id,null,package_slug||'.builder-pages.'||component_slug||'.'||page_slug,
      'page_image',requested_object_key,'private',requested_storage_bucket,requested_mime_type,requested_byte_size,requested_checksum,requested_width,requested_height,
      'builder-pages',page_slug,'draft','internal',jsonb_build_object('upload_session_id',session.id,'original_filename',session.file_descriptor->>'name'))
    returning created_asset.id into created_asset_id;
  end if;
  update builder_component_page_revisions as page_revision
  set revision=page_revision.revision+1,updated_at=now()
  where page_revision.book_component_id=session.book_component_id
  returning page_revision.* into revision_row;
  update builder_component_page_upload_sessions as upload_session
  set state='completed',resulting_page_id=page_row.id,resulting_asset_id=created_asset_id,resulting_revision=revision_row.revision,finalized_at=now(),updated_at=now()
  where upload_session.id=session.id;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'component_page_asset_finalized','book_page',page_row.id::text,jsonb_build_object('component_slug',component_slug,'page_key',session.page_key,'revision',revision_row.revision));
  return query select 'saved',page_row.id,created_asset_id,revision_row.revision;
end $$;
