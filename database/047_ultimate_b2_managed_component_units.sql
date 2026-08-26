-- Ultimate B2 managed component units and relational page placement.
-- This is an expand-only migration: existing function signatures and old
-- Workbook payloads remain valid while the new application requires unitId.

with managed_components as (
  select component.id,component.slug
  from book_components component
  join book_packages package on package.id=component.book_package_id
  where package.slug='ultimate-b2'
    and component.slug in ('ultimate-b2-workbook','ultimate-b2-grammar-book')
), unit_seed as (
  select component.id book_component_id,unit_number
  from managed_components component cross join generate_series(1,10) unit_number
)
insert into units(book_component_id,title,slug,unit_number,sort_order)
select book_component_id,'Unit '||unit_number,'unit-'||unit_number,unit_number,unit_number
from unit_seed
on conflict(book_component_id,slug) do update
set title=excluded.title,unit_number=excluded.unit_number,sort_order=excluded.sort_order,updated_at=now();

-- Workbook and Grammar now have relational Units, but Unit Extras remain a
-- Students Book-only resource. Preserve the existing fail-closed scope after
-- those new Unit rows make a generic package/component/unit join resolvable.
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
  where package.slug=requested_book_slug
    and component.slug=requested_component_slug
    and component.slug='ultimate-b2-students-book'
    and unit_record.slug=requested_unit_slug
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

create or replace function resolve_builder_page_component(requested_book_slug text,requested_component_slug text)
returns table(book_package_id uuid,book_component_id uuid) language sql stable as $$
  select package.id,component.id
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug='ultimate-b2' and package.slug=requested_book_slug
    and component.slug=requested_component_slug
    and component.slug in ('ultimate-b2-students-book','ultimate-b2-workbook','ultimate-b2-grammar-book')
  limit 1
$$;

create or replace function prepare_builder_component_page_upload(
  requested_book_slug text,requested_component_slug text,requested_page_key text,requested_mode text,
  requested_expected_revision bigint,requested_client_mutation_id uuid,requested_upload_id uuid,
  requested_request_sha256 text,requested_page_metadata jsonb,requested_file_descriptor jsonb,
  requested_staging_object_key text,actor_builder_user_id uuid,requested_expires_at timestamptz
)
returns table(outcome text,upload_id uuid,current_revision bigint,session_state text,staging_object_key text)
language plpgsql as $$
declare scope record; revision_row builder_component_page_revisions%rowtype; existing builder_component_page_upload_sessions%rowtype; page_row book_pages%rowtype; requested_unit uuid;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor',null::uuid,null::bigint,null::text,null::text; return;
  end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then
    return query select 'resource_not_found',null::uuid,null::bigint,null::text,null::text; return;
  end if;
  if requested_page_metadata ? 'unitId' and coalesce(requested_page_metadata->>'unitId','')<>'' then
    begin requested_unit:=(requested_page_metadata->>'unitId')::uuid; exception when invalid_text_representation then
      return query select 'invalid_unit',null::uuid,null::bigint,null::text,null::text; return;
    end;
    if not exists(select 1 from units where id=requested_unit and book_component_id=scope.book_component_id and unit_number between 1 and 10 and slug='unit-'||unit_number) then
      return query select 'invalid_unit',null::uuid,null::bigint,null::text,null::text; return;
    end if;
  end if;
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  select * into existing from builder_component_page_upload_sessions where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.id is not null then
    if existing.request_sha256<>requested_request_sha256 then
      return query select 'mutation_id_conflict',existing.id,revision_row.revision,existing.state,null::text;
    else
      return query select 'idempotent',existing.id,revision_row.revision,existing.state,existing.staging_object_key;
    end if;
    return;
  end if;
  if revision_row.revision<>requested_expected_revision then
    return query select 'revision_conflict',null::uuid,revision_row.revision,null::text,null::text; return;
  end if;
  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key;
  if requested_component_slug='ultimate-b2-students-book' and requested_mode<>'replace' then
    return query select 'operation_not_allowed',null::uuid,revision_row.revision,null::text,null::text; return;
  end if;
  if requested_component_slug in ('ultimate-b2-workbook','ultimate-b2-grammar-book') and (
    (requested_mode='create' and page_row.id is not null and coalesce(page_row.source_metadata->>'is_active','false')='true')
    or (requested_mode='replace' and (page_row.id is null or coalesce(page_row.source_metadata->>'is_active','false')<>'true'))
  ) then return query select 'page_state_conflict',null::uuid,revision_row.revision,null::text,null::text; return; end if;
  insert into builder_component_page_upload_sessions(
    id,book_package_id,book_component_id,page_key,upload_mode,expected_revision,client_mutation_id,request_sha256,
    page_metadata,file_descriptor,staging_object_key,created_by_builder_user_id,expires_at
  ) values(requested_upload_id,scope.book_package_id,scope.book_component_id,requested_page_key,requested_mode,requested_expected_revision,
    requested_client_mutation_id,requested_request_sha256,requested_page_metadata,requested_file_descriptor,requested_staging_object_key,actor_builder_user_id,requested_expires_at);
  return query select 'prepared',requested_upload_id,revision_row.revision,'prepared',requested_staging_object_key;
end $$;

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
      jsonb_build_object('source','builder-pages','is_override',student_component,'is_active',not student_component,'printed_label',coalesce(session.page_metadata->>'printedLabel',''),'original_filename',session.file_descriptor->>'name')) returning created_page.* into page_row;
  else
    update book_pages as updated_page set label=session.page_metadata->>'label',sort_order=(session.page_metadata->>'sortOrder')::int,
      unit_id=case when requested_unit is not null then requested_unit else updated_page.unit_id end,
      source_metadata=updated_page.source_metadata||jsonb_build_object('source','builder-pages','is_override',student_component,'is_active',not student_component,'printed_label',coalesce(session.page_metadata->>'printedLabel',''),'original_filename',session.file_descriptor->>'name'),updated_at=now()
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
declare scope record; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype; existing builder_component_page_mutations%rowtype; request_value jsonb; page_slug text; requested_unit uuid;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::bigint; return; end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then return query select 'resource_not_found',null::bigint; return; end if;
  if requested_page_metadata ? 'unitId' and coalesce(requested_page_metadata->>'unitId','')<>'' then
    begin requested_unit:=(requested_page_metadata->>'unitId')::uuid; exception when invalid_text_representation then return query select 'invalid_unit',null::bigint; return; end;
    if not exists(select 1 from units where id=requested_unit and book_component_id=scope.book_component_id and unit_number between 1 and 10 and slug='unit-'||unit_number) then return query select 'invalid_unit',null::bigint; return; end if;
  end if;
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  request_value:=jsonb_build_object('pageKey',requested_page_key,'action',requested_action,'metadata',requested_page_metadata);
  select * into existing from builder_component_page_mutations where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.client_mutation_id is not null then return query select case when existing.request_payload=request_value then 'idempotent' else 'mutation_id_conflict' end,existing.resulting_revision; return; end if;
  if revision_row.revision<>requested_expected_revision then return query select 'revision_conflict',revision_row.revision; return; end if;
  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key for update;
  if page_row.id is null then return query select 'page_not_found',revision_row.revision; return; end if;
  page_slug:=substring(requested_page_key from char_length(requested_component_slug)+8);
  if requested_component_slug='ultimate-b2-students-book' then
    if requested_action<>'restore' then return query select 'operation_not_allowed',revision_row.revision; return; end if;
    update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and asset_role='page_image' and publication_status='draft';
    update book_pages set source_metadata=source_metadata||'{"is_override":false}'::jsonb,updated_at=now() where id=page_row.id;
  else
    if requested_action in ('metadata','reorder') then
      update book_pages set label=requested_page_metadata->>'label',sort_order=(requested_page_metadata->>'sortOrder')::int,
        unit_id=case when requested_unit is not null then requested_unit else unit_id end,
        source_metadata=source_metadata||jsonb_build_object('printed_label',coalesce(requested_page_metadata->>'printedLabel','')),updated_at=now() where id=page_row.id;
      update book_assets set unit_id=(select unit_id from book_pages where id=page_row.id),updated_at=now() where page_id=page_row.id and publication_status='draft';
    elsif requested_action='delete' then
      if exists(select 1 from builder_component_documents where book_component_id=scope.book_component_id and payload::text like '%'||page_slug||'%')
        or exists(select 1 from book_page_hotspots where package_slug=requested_book_slug and component_slug=requested_component_slug and page_id=page_slug)
        or exists(select 1 from book_activities where package_slug=requested_book_slug and component_slug=requested_component_slug and page_id=page_slug)
        or exists(select 1 from book_media_assets where package_slug=requested_book_slug and component_slug=requested_component_slug and page_id=page_slug)
        or exists(select 1 from book_assets where page_id=page_row.id and asset_role<>'page_image' and publication_status<>'archived') then return query select 'page_referenced',revision_row.revision; return; end if;
      update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and publication_status='draft';
      update book_pages set source_metadata=source_metadata||'{"is_active":false}'::jsonb,updated_at=now() where id=page_row.id;
    else return query select 'operation_not_allowed',revision_row.revision; return; end if;
  end if;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=scope.book_component_id returning * into revision_row;
  insert into builder_component_page_mutations(book_component_id,client_mutation_id,request_payload,resulting_revision,created_by_builder_user_id) values(scope.book_component_id,requested_client_mutation_id,request_value,revision_row.revision,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_'||requested_action,'book_page',page_row.id::text,jsonb_build_object('component_slug',requested_component_slug,'revision',revision_row.revision));
  return query select 'saved',revision_row.revision;
end $$;
