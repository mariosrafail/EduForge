-- Atomic, reversible Builder page tombstones. Page deletion prunes only the
-- effective hotspot placement document and deliberately preserves activities,
-- activity documents, indexes, assets, and immutable releases.

alter table builder_component_page_mutations
  add column if not exists resulting_hotspot_revision bigint,
  add column if not exists removed_hotspot_count int,
  add column if not exists preserved_activity_count int;

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
  request_value jsonb; page_slug text; next_hotspot_revision bigint; resolved_unit_id uuid;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor',null::bigint,null::bigint,0,0; return;
  end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then
    return query select 'resource_not_found',null::bigint,null::bigint,0,0; return;
  end if;
  if requested_hotspot_schema_version!~'^[0-9]+\.[0-9]+$' or requested_hotspot_sha256!~'^[a-f0-9]{64}$'
    or jsonb_typeof(requested_hotspot_payload)<>'object' or jsonb_typeof(requested_hotspot_payload->'pages')<>'object'
    or requested_hotspot_payload->>'schemaVersion'<>requested_hotspot_schema_version
    or requested_hotspot_payload->>'packageSlug'<>requested_book_slug
    or requested_removed_hotspot_count<0 or requested_preserved_activity_count<0 then
    return query select 'invalid_hotspot_projection',null::bigint,null::bigint,0,0; return;
  end if;
  page_slug:=substring(requested_page_key from char_length(requested_component_slug)+8);
  if requested_hotspot_payload->'pages' ? page_slug then
    return query select 'invalid_hotspot_projection',null::bigint,null::bigint,0,0; return;
  end if;

  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  select * into hotspot_document from builder_component_documents where book_component_id=scope.book_component_id and document_type='hotspots' and document_key='default' for update;
  next_hotspot_revision:=coalesce(hotspot_document.revision,0);
  request_value:=jsonb_build_object('pageKey',requested_page_key,'action','delete','expectedRevision',requested_expected_revision,'expectedHotspotRevision',requested_expected_hotspot_revision,
    'pageMetadata',requested_page_metadata,'hotspotSha256',requested_hotspot_sha256,'removedHotspotCount',requested_removed_hotspot_count,'preservedActivityCount',requested_preserved_activity_count);
  select * into existing from builder_component_page_mutations where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.client_mutation_id is not null then
    return query select case when existing.request_payload=request_value then 'idempotent' else 'mutation_id_conflict' end,
      existing.resulting_revision,coalesce(existing.resulting_hotspot_revision,next_hotspot_revision),coalesce(existing.removed_hotspot_count,0),coalesce(existing.preserved_activity_count,0); return;
  end if;
  if revision_row.revision<>requested_expected_revision then
    return query select 'revision_conflict',revision_row.revision,next_hotspot_revision,0,0; return;
  end if;
  if next_hotspot_revision<>requested_expected_hotspot_revision then
    return query select 'hotspot_revision_conflict',revision_row.revision,next_hotspot_revision,0,0; return;
  end if;

  if exists(select 1 from book_media_assets where package_slug=requested_book_slug and component_slug=requested_component_slug and page_id=page_slug)
    or exists(select 1 from builder_component_documents where book_component_id=scope.book_component_id
      and document_type not in ('hotspots','native_activity_index','native_activity_public','native_activity_teacher','activity_lifecycle','open_response')
      and payload::text like '%'||page_slug||'%') then
    return query select 'unsupported_page_reference',revision_row.revision,next_hotspot_revision,0,0; return;
  end if;

  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key for update;
  if page_row.id is null and requested_component_slug='ultimate-b2-students-book' then
    select id into resolved_unit_id from units where book_component_id=scope.book_component_id and unit_number=(requested_page_metadata->>'unitNumber')::int limit 1;
    insert into book_pages(book_package_id,book_component_id,unit_id,stable_key,label,sort_order,source_metadata)
    values(scope.book_package_id,scope.book_component_id,resolved_unit_id,requested_page_key,requested_page_metadata->>'label',(requested_page_metadata->>'sortOrder')::int,
      jsonb_build_object('source','builder-pages','is_override',false,'is_active',false,'is_deleted',true,'printed_label',coalesce(requested_page_metadata->>'printedLabel',''),'removed_hotspot_count',requested_removed_hotspot_count,'deleted_at',now()))
    returning * into page_row;
  elsif page_row.id is null then
    return query select 'page_not_found',revision_row.revision,next_hotspot_revision,0,0; return;
  elsif (requested_component_slug='ultimate-b2-students-book' and coalesce(page_row.source_metadata->>'is_deleted','false')='true')
    or (requested_component_slug<>'ultimate-b2-students-book' and coalesce(page_row.source_metadata->>'is_active','false')<>'true') then
    return query select 'page_state_conflict',revision_row.revision,next_hotspot_revision,0,0; return;
  end if;

  if exists(select 1 from book_assets where page_id=page_row.id and asset_role<>'page_image' and publication_status<>'archived') then
    return query select 'unsupported_page_reference',revision_row.revision,next_hotspot_revision,0,0; return;
  end if;

  if requested_removed_hotspot_count>0 then
    next_hotspot_revision:=next_hotspot_revision+1;
    if hotspot_document.id is null then
      insert into builder_component_documents(book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,created_by_builder_user_id,updated_by_builder_user_id)
      values(scope.book_package_id,scope.book_component_id,'hotspots','default',requested_hotspot_schema_version,next_hotspot_revision,requested_hotspot_payload,requested_hotspot_sha256,actor_builder_user_id,actor_builder_user_id)
      returning * into hotspot_document;
    else
      update builder_component_documents set schema_version=requested_hotspot_schema_version,revision=next_hotspot_revision,payload=requested_hotspot_payload,
        payload_sha256=requested_hotspot_sha256,updated_by_builder_user_id=actor_builder_user_id,updated_at=now()
      where id=hotspot_document.id returning * into hotspot_document;
    end if;
    insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id)
    values(hotspot_document.id,next_hotspot_revision,requested_hotspot_payload,requested_hotspot_sha256,actor_builder_user_id,requested_client_mutation_id);
  end if;

  update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and asset_role='page_image' and publication_status='draft';
  update book_pages set source_metadata=source_metadata||jsonb_build_object('is_active',false,'is_deleted',true,'is_override',false,'removed_hotspot_count',requested_removed_hotspot_count,'deleted_at',now()),updated_at=now() where id=page_row.id;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=scope.book_component_id returning * into revision_row;
  insert into builder_component_page_mutations(book_component_id,client_mutation_id,request_payload,resulting_revision,resulting_hotspot_revision,removed_hotspot_count,preserved_activity_count,created_by_builder_user_id)
  values(scope.book_component_id,requested_client_mutation_id,request_value,revision_row.revision,next_hotspot_revision,requested_removed_hotspot_count,requested_preserved_activity_count,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'component_page_deleted','book_page',page_row.id::text,jsonb_build_object('component_slug',requested_component_slug,'page_key',requested_page_key,'page_revision',revision_row.revision,'hotspot_revision',next_hotspot_revision,'removed_hotspot_count',requested_removed_hotspot_count,'preserved_activity_count',requested_preserved_activity_count));
  return query select 'saved',revision_row.revision,next_hotspot_revision,requested_removed_hotspot_count,requested_preserved_activity_count;
end $$;

create or replace function restore_builder_students_page(
  requested_book_slug text,requested_component_slug text,requested_page_key text,requested_expected_revision bigint,
  requested_client_mutation_id uuid,actor_builder_user_id uuid
)
returns table(outcome text,current_revision bigint) language plpgsql as $$
declare scope record; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype; existing builder_component_page_mutations%rowtype; request_value jsonb;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::bigint; return; end if;
  if requested_book_slug<>'ultimate-b2' or requested_component_slug<>'ultimate-b2-students-book' then return query select 'resource_not_found',null::bigint; return; end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  request_value:=jsonb_build_object('pageKey',requested_page_key,'action','restore','expectedRevision',requested_expected_revision,'metadata','{}'::jsonb);
  select * into existing from builder_component_page_mutations where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.client_mutation_id is not null then return query select case when existing.request_payload=request_value then 'idempotent' else 'mutation_id_conflict' end,existing.resulting_revision; return; end if;
  if revision_row.revision<>requested_expected_revision then return query select 'revision_conflict',revision_row.revision; return; end if;
  select * into page_row from book_pages where book_component_id=scope.book_component_id and stable_key=requested_page_key for update;
  if page_row.id is null then return query select 'page_not_found',revision_row.revision; return; end if;
  if coalesce(page_row.source_metadata->>'is_deleted','false')<>'true' and coalesce(page_row.source_metadata->>'is_override','false')<>'true' then return query select 'page_state_conflict',revision_row.revision; return; end if;
  update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and asset_role='page_image' and publication_status='draft';
  update book_pages set source_metadata=(source_metadata-'deleted_at')||jsonb_build_object('is_active',true,'is_deleted',false,'is_override',false),updated_at=now() where id=page_row.id;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=scope.book_component_id returning * into revision_row;
  insert into builder_component_page_mutations(book_component_id,client_mutation_id,request_payload,resulting_revision,created_by_builder_user_id) values(scope.book_component_id,requested_client_mutation_id,request_value,revision_row.revision,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_restored','book_page',page_row.id::text,jsonb_build_object('component_slug',requested_component_slug,'revision',revision_row.revision,'hotspots_restored',false));
  return query select 'saved',revision_row.revision;
end $$;
