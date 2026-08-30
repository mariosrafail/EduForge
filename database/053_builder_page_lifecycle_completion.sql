-- Complete the cross-component Builder page lifecycle. Soft deletion preserves
-- activities and exact page-image history, restore never recreates hotspots,
-- and permanent deletion is a current-draft tombstone rather than physical
-- removal of rows, assets, audit records, or immutable releases.

create or replace function complete_builder_component_page_upload(
  requested_upload_id uuid,actor_builder_user_id uuid,requested_object_key text,requested_storage_bucket text,
  requested_mime_type text,requested_byte_size bigint,requested_checksum text,requested_width int,requested_height int
)
returns table(outcome text,page_id uuid,asset_id uuid,revision bigint) language plpgsql as $$
declare session builder_component_page_upload_sessions%rowtype; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype;
  edition book_editions%rowtype; created_asset_id uuid; package_slug text; component_slug text; page_slug text; student_component boolean; requested_unit uuid;
begin
  select upload_session.* into session from builder_component_page_upload_sessions upload_session where upload_session.id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id or session.state<>'finalizing' then raise exception 'page upload session cannot be completed'; end if;
  if requested_mime_type not in ('image/png','image/jpeg','image/webp') or requested_byte_size<1 or requested_checksum!~'^[a-f0-9]{64}$' or requested_width<1 or requested_height<1 then raise exception 'page upload metadata is invalid'; end if;
  select book_package.slug,component.slug into package_slug,component_slug from book_packages book_package join book_components component on component.book_package_id=book_package.id where component.id=session.book_component_id;
  student_component:=component_slug='ultimate-b2-students-book';
  page_slug:=substring(session.page_key from char_length(component_slug)+8);
  if session.page_metadata ? 'unitId' and coalesce(session.page_metadata->>'unitId','')<>'' then
    requested_unit:=(session.page_metadata->>'unitId')::uuid;
    if not exists(select 1 from units where id=requested_unit and book_component_id=session.book_component_id and unit_number between 1 and 10 and slug='unit-'||unit_number) then raise exception 'page upload unit is invalid'; end if;
  end if;
  select page_revision.* into revision_row from builder_component_page_revisions page_revision where page_revision.book_component_id=session.book_component_id for update;
  if revision_row.revision<>session.expected_revision then raise exception 'page revision changed during finalize'; end if;
  select component_page.* into page_row from book_pages component_page where component_page.book_component_id=session.book_component_id and component_page.stable_key=session.page_key for update;
  if page_row.id is null then
    insert into book_pages as created_page(book_package_id,book_component_id,unit_id,stable_key,label,sort_order,source_metadata)
    values(session.book_package_id,session.book_component_id,requested_unit,session.page_key,session.page_metadata->>'label',(session.page_metadata->>'sortOrder')::int,
      jsonb_build_object('source','builder-pages','is_override',student_component,'has_image_override',student_component,'has_metadata_override',false,'is_active',true,'is_deleted',false,'printed_label',coalesce(session.page_metadata->>'printedLabel',''),'original_filename',session.file_descriptor->>'name')) returning created_page.* into page_row;
  else
    if coalesce(page_row.source_metadata->>'is_deleted','false')='true' or coalesce(page_row.source_metadata->>'is_permanently_deleted','false')='true' then raise exception 'page upload target is inactive'; end if;
    update book_pages as updated_page set label=session.page_metadata->>'label',sort_order=(session.page_metadata->>'sortOrder')::int,
      unit_id=case when requested_unit is not null then requested_unit else updated_page.unit_id end,
      source_metadata=updated_page.source_metadata||jsonb_build_object('source','builder-pages','is_override',student_component or coalesce((updated_page.source_metadata->>'has_metadata_override')::boolean,false),'has_image_override',student_component,'is_active',true,'is_deleted',false,'printed_label',coalesce(session.page_metadata->>'printedLabel',''),'original_filename',session.file_descriptor->>'name'),updated_at=now()
    where updated_page.id=page_row.id returning updated_page.* into page_row;
  end if;
  insert into book_editions as page_edition(book_package_id,edition_identifier,title,status,source_metadata)
  values(session.book_package_id,'builder-pages','Builder page assets','draft','{"source":"builder-pages"}'::jsonb)
  on conflict(book_package_id,edition_identifier) do update set updated_at=now() returning page_edition.* into edition;
  update book_assets page_asset set publication_status='archived',updated_at=now() where page_asset.page_id=page_row.id and page_asset.asset_role='page_image' and page_asset.publication_status='draft';
  select existing_asset.id into created_asset_id from book_assets existing_asset where existing_asset.storage_bucket=requested_storage_bucket and existing_asset.object_key=requested_object_key;
  if created_asset_id is not null then
    update book_assets managed_asset set publication_status='draft',unit_id=page_row.unit_id,updated_at=now()
    where managed_asset.id=created_asset_id and managed_asset.book_package_id=session.book_package_id and managed_asset.book_component_id=session.book_component_id and managed_asset.page_id=page_row.id
      and managed_asset.asset_role='page_image' and managed_asset.mime_type=requested_mime_type and managed_asset.byte_size=requested_byte_size and managed_asset.checksum_sha256=requested_checksum
      and managed_asset.width=requested_width and managed_asset.height=requested_height and managed_asset.storage_profile='private' and managed_asset.access_level='internal';
    if not found then raise exception 'page managed asset identity conflict'; end if;
  else
    insert into book_assets as created_asset(book_package_id,edition_id,book_component_id,unit_id,page_id,activity_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,width,height,edition_identifier,version,publication_status,access_level,source_metadata)
    values(session.book_package_id,edition.id,session.book_component_id,page_row.unit_id,page_row.id,null,package_slug||'.builder-pages.'||component_slug||'.'||page_slug,'page_image',requested_object_key,'private',requested_storage_bucket,requested_mime_type,requested_byte_size,requested_checksum,requested_width,requested_height,'builder-pages',page_slug,'draft','internal',jsonb_build_object('upload_session_id',session.id,'original_filename',session.file_descriptor->>'name')) returning created_asset.id into created_asset_id;
  end if;
  update builder_component_page_revisions page_revision set revision=page_revision.revision+1,updated_at=now() where page_revision.book_component_id=session.book_component_id returning page_revision.* into revision_row;
  update builder_component_page_upload_sessions upload_session set state='completed',resulting_page_id=page_row.id,resulting_asset_id=created_asset_id,resulting_revision=revision_row.revision,finalized_at=now(),updated_at=now() where upload_session.id=session.id;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_asset_finalized','book_page',page_row.id::text,jsonb_build_object('component_slug',component_slug,'page_key',session.page_key,'revision',revision_row.revision));
  return query select 'saved',page_row.id,created_asset_id,revision_row.revision;
end $$;

create or replace function mutate_builder_component_page(
  requested_book_slug text,requested_component_slug text,requested_page_key text,requested_action text,requested_expected_revision bigint,
  requested_client_mutation_id uuid,requested_page_metadata jsonb,actor_builder_user_id uuid
)
returns table(outcome text,current_revision bigint) language plpgsql as $$
declare scope record; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype; existing builder_component_page_mutations%rowtype; request_value jsonb; requested_unit uuid;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::bigint; return; end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then return query select 'resource_not_found',null::bigint; return; end if;
  if requested_page_metadata ? 'unitId' and coalesce(requested_page_metadata->>'unitId','')<>'' then
    begin requested_unit:=(requested_page_metadata->>'unitId')::uuid; exception when invalid_text_representation then return query select 'invalid_unit',null::bigint; return; end;
    if requested_component_slug='ultimate-b2-students-book' or not exists(select 1 from units where id=requested_unit and book_component_id=scope.book_component_id and unit_number between 1 and 10 and slug='unit-'||unit_number) then return query select 'invalid_unit',null::bigint; return; end if;
  end if;
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  request_value:=jsonb_build_object('pageKey',requested_page_key,'action',requested_action,'metadata',requested_page_metadata);
  select * into existing from builder_component_page_mutations where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.client_mutation_id is not null then return query select case when existing.request_payload=request_value then 'idempotent' else 'mutation_id_conflict' end,existing.resulting_revision; return; end if;
  if revision_row.revision<>requested_expected_revision then return query select 'revision_conflict',revision_row.revision; return; end if;
  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key for update;
  if page_row.id is null then return query select 'page_not_found',revision_row.revision; return; end if;
  if coalesce(page_row.source_metadata->>'is_deleted','false')='true' or coalesce(page_row.source_metadata->>'is_permanently_deleted','false')='true' then return query select 'page_state_conflict',revision_row.revision; return; end if;
  if requested_action in ('metadata','reorder') then
    update book_pages set label=requested_page_metadata->>'label',sort_order=(requested_page_metadata->>'sortOrder')::int,
      unit_id=case when requested_unit is not null then requested_unit else unit_id end,
      source_metadata=source_metadata||jsonb_build_object('printed_label',coalesce(requested_page_metadata->>'printedLabel',''),'has_metadata_override',requested_component_slug='ultimate-b2-students-book','is_override',requested_component_slug='ultimate-b2-students-book' or coalesce((source_metadata->>'is_override')::boolean,false)),updated_at=now() where id=page_row.id;
    update book_assets set unit_id=(select unit_id from book_pages where id=page_row.id),updated_at=now() where page_id=page_row.id and publication_status='draft';
  elsif requested_action='restore-image' and requested_component_slug='ultimate-b2-students-book' then
    update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and asset_role='page_image' and publication_status='draft';
    update book_pages set source_metadata=source_metadata||jsonb_build_object('has_image_override',false,'is_override',coalesce((source_metadata->>'has_metadata_override')::boolean,false)),updated_at=now() where id=page_row.id;
  else return query select 'operation_not_allowed',revision_row.revision; return; end if;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=scope.book_component_id returning * into revision_row;
  insert into builder_component_page_mutations(book_component_id,client_mutation_id,request_payload,resulting_revision,created_by_builder_user_id) values(scope.book_component_id,requested_client_mutation_id,request_value,revision_row.revision,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_'||replace(requested_action,'-','_'),'book_page',page_row.id::text,jsonb_build_object('component_slug',requested_component_slug,'revision',revision_row.revision));
  return query select 'saved',revision_row.revision;
end $$;

create or replace function delete_builder_component_page_lifecycle(
  requested_book_slug text,requested_component_slug text,requested_page_key text,
  requested_expected_revision bigint,requested_expected_hotspot_revision bigint,
  requested_client_mutation_id uuid,requested_page_metadata jsonb,
  requested_hotspot_schema_version text,requested_hotspot_payload jsonb,requested_hotspot_sha256 text,
  requested_removed_hotspot_count int,requested_preserved_activity_count int,actor_builder_user_id uuid
)
returns table(outcome text,current_revision bigint,hotspot_revision bigint,removed_hotspot_count int,preserved_activity_count int)
language plpgsql as $$
declare
  scope record; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype;
  hotspot_document builder_component_documents%rowtype; existing builder_component_page_mutations%rowtype;
  request_value jsonb; page_slug text; next_hotspot_revision bigint; resolved_unit_id uuid; restorable_asset_id uuid;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::bigint,null::bigint,0,0; return; end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then return query select 'resource_not_found',null::bigint,null::bigint,0,0; return; end if;
  if requested_hotspot_schema_version!~'^[0-9]+\.[0-9]+$' or requested_hotspot_sha256!~'^[a-f0-9]{64}$'
    or jsonb_typeof(requested_hotspot_payload)<>'object' or jsonb_typeof(requested_hotspot_payload->'pages')<>'object'
    or requested_hotspot_payload->>'schemaVersion'<>requested_hotspot_schema_version or requested_hotspot_payload->>'packageSlug'<>requested_book_slug
    or requested_removed_hotspot_count<0 or requested_preserved_activity_count<0 then return query select 'invalid_hotspot_projection',null::bigint,null::bigint,0,0; return; end if;
  page_slug:=substring(requested_page_key from char_length(requested_component_slug)+8);
  if requested_hotspot_payload->'pages' ? page_slug then return query select 'invalid_hotspot_projection',null::bigint,null::bigint,0,0; return; end if;
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  select * into hotspot_document from builder_component_documents where book_component_id=scope.book_component_id and document_type='hotspots' and document_key='default' for update;
  next_hotspot_revision:=coalesce(hotspot_document.revision,0);
  request_value:=jsonb_build_object('pageKey',requested_page_key,'action','delete','expectedRevision',requested_expected_revision,'expectedHotspotRevision',requested_expected_hotspot_revision,'pageMetadata',requested_page_metadata,'hotspotSha256',requested_hotspot_sha256,'removedHotspotCount',requested_removed_hotspot_count,'preservedActivityCount',requested_preserved_activity_count);
  select * into existing from builder_component_page_mutations where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.client_mutation_id is not null then return query select case when existing.request_payload=request_value then 'idempotent' else 'mutation_id_conflict' end,existing.resulting_revision,coalesce(existing.resulting_hotspot_revision,next_hotspot_revision),coalesce(existing.removed_hotspot_count,0),coalesce(existing.preserved_activity_count,0); return; end if;
  if revision_row.revision<>requested_expected_revision then return query select 'revision_conflict',revision_row.revision,next_hotspot_revision,0,0; return; end if;
  if next_hotspot_revision<>requested_expected_hotspot_revision then return query select 'hotspot_revision_conflict',revision_row.revision,next_hotspot_revision,0,0; return; end if;
  if exists(select 1 from book_media_assets where package_slug=requested_book_slug and component_slug=requested_component_slug and page_id=page_slug)
    or exists(select 1 from builder_component_documents where book_component_id=scope.book_component_id
      and document_type not in ('hotspots','native_activity_index','native_activity_public','native_activity_teacher','activity_lifecycle','open_response')
      and not (requested_book_slug='ultimate-b2' and requested_component_slug='ultimate-b2-students-book' and document_type='unit_extras' and document_key='default')
      and payload::text like '%'||page_slug||'%') then return query select 'unsupported_page_reference',revision_row.revision,next_hotspot_revision,0,0; return; end if;
  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key for update;
  if page_row.id is null and requested_component_slug='ultimate-b2-students-book' then
    select id into resolved_unit_id from units where book_component_id=scope.book_component_id and unit_number=(requested_page_metadata->>'unitNumber')::int limit 1;
    insert into book_pages(book_package_id,book_component_id,unit_id,stable_key,label,sort_order,source_metadata)
    values(scope.book_package_id,scope.book_component_id,resolved_unit_id,requested_page_key,requested_page_metadata->>'label',(requested_page_metadata->>'sortOrder')::int,
      jsonb_build_object('source','builder-pages','is_override',false,'has_image_override',false,'has_metadata_override',false,'is_active',false,'is_deleted',true,'is_permanently_deleted',false,'printed_label',coalesce(requested_page_metadata->>'printedLabel',''),'removed_hotspot_count',requested_removed_hotspot_count,'preserved_activity_count',requested_preserved_activity_count,'deleted_at',now())) returning * into page_row;
  elsif page_row.id is null then return query select 'page_not_found',revision_row.revision,next_hotspot_revision,0,0; return;
  elsif coalesce(page_row.source_metadata->>'is_deleted','false')='true' or coalesce(page_row.source_metadata->>'is_permanently_deleted','false')='true' or (requested_component_slug<>'ultimate-b2-students-book' and coalesce(page_row.source_metadata->>'is_active','false')<>'true') then return query select 'page_state_conflict',revision_row.revision,next_hotspot_revision,0,0; return; end if;
  if exists(select 1 from book_assets where page_id=page_row.id and asset_role<>'page_image' and publication_status<>'archived') then return query select 'unsupported_page_reference',revision_row.revision,next_hotspot_revision,0,0; return; end if;
  select id into restorable_asset_id from book_assets where page_id=page_row.id and book_component_id=scope.book_component_id and asset_role='page_image' and publication_status='draft' and storage_profile='private' and access_level='internal' order by updated_at desc,id limit 1;
  if requested_removed_hotspot_count>0 then
    next_hotspot_revision:=next_hotspot_revision+1;
    if hotspot_document.id is null then
      insert into builder_component_documents(book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,created_by_builder_user_id,updated_by_builder_user_id)
      values(scope.book_package_id,scope.book_component_id,'hotspots','default',requested_hotspot_schema_version,next_hotspot_revision,requested_hotspot_payload,requested_hotspot_sha256,actor_builder_user_id,actor_builder_user_id) returning * into hotspot_document;
    else update builder_component_documents set schema_version=requested_hotspot_schema_version,revision=next_hotspot_revision,payload=requested_hotspot_payload,payload_sha256=requested_hotspot_sha256,updated_by_builder_user_id=actor_builder_user_id,updated_at=now() where id=hotspot_document.id returning * into hotspot_document; end if;
    insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id) values(hotspot_document.id,next_hotspot_revision,requested_hotspot_payload,requested_hotspot_sha256,actor_builder_user_id,requested_client_mutation_id);
  end if;
  update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and asset_role='page_image' and publication_status='draft';
  update book_pages set source_metadata=source_metadata||jsonb_strip_nulls(jsonb_build_object('is_active',false,'is_deleted',true,'is_permanently_deleted',false,'removed_hotspot_count',requested_removed_hotspot_count,'preserved_activity_count',requested_preserved_activity_count,'restorable_asset_id',restorable_asset_id::text,'deleted_at',now())),updated_at=now() where id=page_row.id;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=scope.book_component_id returning * into revision_row;
  insert into builder_component_page_mutations(book_component_id,client_mutation_id,request_payload,resulting_revision,resulting_hotspot_revision,removed_hotspot_count,preserved_activity_count,created_by_builder_user_id) values(scope.book_component_id,requested_client_mutation_id,request_value,revision_row.revision,next_hotspot_revision,requested_removed_hotspot_count,requested_preserved_activity_count,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_deleted','book_page',page_row.id::text,jsonb_build_object('component_slug',requested_component_slug,'page_key',requested_page_key,'page_revision',revision_row.revision,'hotspot_revision',next_hotspot_revision,'removed_hotspot_count',requested_removed_hotspot_count,'preserved_activity_count',requested_preserved_activity_count));
  return query select 'saved',revision_row.revision,next_hotspot_revision,requested_removed_hotspot_count,requested_preserved_activity_count;
end $$;

create or replace function restore_builder_component_page(
  requested_book_slug text,requested_component_slug text,requested_page_key text,requested_expected_revision bigint,
  requested_client_mutation_id uuid,actor_builder_user_id uuid
)
returns table(outcome text,current_revision bigint) language plpgsql as $$
declare scope record; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype; existing builder_component_page_mutations%rowtype; request_value jsonb; restore_asset uuid; candidate_count int;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::bigint; return; end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then return query select 'resource_not_found',null::bigint; return; end if;
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  request_value:=jsonb_build_object('pageKey',requested_page_key,'action','restore-page','expectedRevision',requested_expected_revision);
  select * into existing from builder_component_page_mutations where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.client_mutation_id is not null then return query select case when existing.request_payload=request_value then 'idempotent' else 'mutation_id_conflict' end,existing.resulting_revision; return; end if;
  if revision_row.revision<>requested_expected_revision then return query select 'revision_conflict',revision_row.revision; return; end if;
  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key for update;
  if page_row.id is null then return query select 'page_not_found',revision_row.revision; return; end if;
  if coalesce(page_row.source_metadata->>'is_permanently_deleted','false')='true' then return query select 'page_permanently_deleted',revision_row.revision; return; end if;
  if coalesce(page_row.source_metadata->>'is_deleted','false')<>'true' then return query select 'page_state_conflict',revision_row.revision; return; end if;
  if coalesce(page_row.source_metadata->>'restorable_asset_id','')<>'' then
    begin restore_asset:=(page_row.source_metadata->>'restorable_asset_id')::uuid; exception when invalid_text_representation then return query select 'restorable_asset_unavailable',revision_row.revision; return; end;
  elsif requested_component_slug<>'ultimate-b2-students-book' then
    select count(*)::int,(array_agg(id order by id))[1] into candidate_count,restore_asset from book_assets where page_id=page_row.id and book_component_id=scope.book_component_id and book_package_id=scope.book_package_id and asset_role='page_image' and publication_status='archived' and storage_profile='private' and access_level='internal' and updated_at=page_row.updated_at;
    if candidate_count<>1 then select count(*)::int,(array_agg(id order by id))[1] into candidate_count,restore_asset from book_assets where page_id=page_row.id and book_component_id=scope.book_component_id and book_package_id=scope.book_package_id and asset_role='page_image' and publication_status='archived' and storage_profile='private' and access_level='internal'; end if;
    if candidate_count<>1 then return query select 'restorable_asset_unavailable',revision_row.revision; return; end if;
  end if;
  if restore_asset is not null then
    update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and asset_role='page_image' and publication_status='draft';
    update book_assets set publication_status='draft',unit_id=page_row.unit_id,updated_at=now() where id=restore_asset and page_id=page_row.id and book_component_id=scope.book_component_id and book_package_id=scope.book_package_id and asset_role='page_image' and publication_status='archived' and storage_profile='private' and access_level='internal';
    if not found then return query select 'restorable_asset_unavailable',revision_row.revision; return; end if;
  end if;
  update book_pages set source_metadata=(source_metadata-'deleted_at')||jsonb_build_object('is_active',true,'is_deleted',false,'is_permanently_deleted',false,'has_image_override',case when requested_component_slug='ultimate-b2-students-book' then restore_asset is not null else coalesce((source_metadata->>'has_image_override')::boolean,false) end,'is_override',case when requested_component_slug='ultimate-b2-students-book' then restore_asset is not null or coalesce((source_metadata->>'has_metadata_override')::boolean,false) else coalesce((source_metadata->>'is_override')::boolean,false) end),updated_at=now() where id=page_row.id;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=scope.book_component_id returning * into revision_row;
  insert into builder_component_page_mutations(book_component_id,client_mutation_id,request_payload,resulting_revision,created_by_builder_user_id) values(scope.book_component_id,requested_client_mutation_id,request_value,revision_row.revision,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_restored','book_page',page_row.id::text,jsonb_build_object('component_slug',requested_component_slug,'revision',revision_row.revision,'hotspots_restored',false,'asset_id',restore_asset));
  return query select 'saved',revision_row.revision;
end $$;

create or replace function purge_builder_component_page(
  requested_book_slug text,requested_component_slug text,requested_page_key text,requested_expected_revision bigint,
  requested_client_mutation_id uuid,actor_builder_user_id uuid
)
returns table(outcome text,current_revision bigint) language plpgsql as $$
declare scope record; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype; existing builder_component_page_mutations%rowtype; request_value jsonb;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::bigint; return; end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then return query select 'resource_not_found',null::bigint; return; end if;
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  request_value:=jsonb_build_object('pageKey',requested_page_key,'action','purge','expectedRevision',requested_expected_revision);
  select * into existing from builder_component_page_mutations where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.client_mutation_id is not null then return query select case when existing.request_payload=request_value then 'idempotent' else 'mutation_id_conflict' end,existing.resulting_revision; return; end if;
  if revision_row.revision<>requested_expected_revision then return query select 'revision_conflict',revision_row.revision; return; end if;
  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key for update;
  if page_row.id is null then return query select 'page_not_found',revision_row.revision; return; end if;
  if coalesce(page_row.source_metadata->>'is_permanently_deleted','false')='true' then return query select 'page_permanently_deleted',revision_row.revision; return; end if;
  if coalesce(page_row.source_metadata->>'is_deleted','false')<>'true' then return query select 'page_state_conflict',revision_row.revision; return; end if;
  update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and publication_status='draft';
  update book_pages set source_metadata=source_metadata||jsonb_build_object('is_active',false,'is_deleted',true,'is_permanently_deleted',true,'permanently_deleted_at',now()),updated_at=now() where id=page_row.id;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=scope.book_component_id returning * into revision_row;
  insert into builder_component_page_mutations(book_component_id,client_mutation_id,request_payload,resulting_revision,created_by_builder_user_id) values(scope.book_component_id,requested_client_mutation_id,request_value,revision_row.revision,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_permanently_deleted','book_page',page_row.id::text,jsonb_build_object('component_slug',requested_component_slug,'revision',revision_row.revision,'activities_preserved',true,'immutable_releases_affected',false));
  return query select 'saved',revision_row.revision;
end $$;
