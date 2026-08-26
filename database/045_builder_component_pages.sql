-- Component-scoped Builder page libraries. Durable page identity lives in
-- book_pages, binary metadata in book_assets, and private bytes in object storage.

create table if not exists builder_component_page_revisions (
  book_component_id uuid primary key references book_components(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists builder_component_page_upload_sessions (
  id uuid primary key,
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
  page_key text not null,
  upload_mode text not null check (upload_mode in ('create','replace')),
  expected_revision bigint not null check (expected_revision >= 0),
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  page_metadata jsonb not null check (jsonb_typeof(page_metadata)='object'),
  file_descriptor jsonb not null check (jsonb_typeof(file_descriptor)='object'),
  staging_object_key text not null,
  state text not null default 'prepared' check (state in ('prepared','finalizing','completed','failed','cancelled')),
  resulting_page_id uuid references book_pages(id) on delete restrict,
  resulting_asset_id uuid references book_assets(id) on delete restrict,
  resulting_revision bigint,
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  expires_at timestamptz not null,
  failure_code text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(book_component_id,client_mutation_id),
  constraint builder_page_upload_component_package_fk foreign key(book_component_id,book_package_id)
    references book_components(id,book_package_id) on delete cascade,
  constraint builder_page_upload_completion_check check (
    (state='completed' and resulting_page_id is not null and resulting_asset_id is not null and resulting_revision is not null and finalized_at is not null)
    or (state<>'completed' and resulting_page_id is null and resulting_asset_id is null and resulting_revision is null)
  ),
  constraint builder_page_upload_key_check check (
    page_key ~ '^[a-z0-9][a-z0-9._/-]{0,255}$' and page_key !~ '(^|/)\.\.(/|$)'
  ),
  constraint builder_page_upload_object_key_check check (
    char_length(staging_object_key) between 1 and 1024 and staging_object_key ~ '^[a-z0-9][a-z0-9._/-]*$'
    and staging_object_key !~ '(^|/)\.\.(/|$)' and staging_object_key !~ '//'
  )
);

create index if not exists builder_page_upload_expiry_idx on builder_component_page_upload_sessions(state,expires_at);

create table if not exists builder_component_page_mutations (
  book_component_id uuid not null references book_components(id) on delete cascade,
  client_mutation_id uuid not null,
  request_payload jsonb not null,
  resulting_revision bigint not null,
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(book_component_id,client_mutation_id)
);

create or replace function resolve_builder_page_component(requested_book_slug text,requested_component_slug text)
returns table(book_package_id uuid,book_component_id uuid) language sql stable as $$
  select package.id,component.id
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug='ultimate-b2' and package.slug=requested_book_slug
    and component.slug=requested_component_slug
    and component.slug in ('ultimate-b2-students-book','ultimate-b2-workbook')
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
declare scope record; revision_row builder_component_page_revisions%rowtype; existing builder_component_page_upload_sessions%rowtype; page_row book_pages%rowtype;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor',null::uuid,null::bigint,null::text,null::text; return;
  end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then
    return query select 'resource_not_found',null::uuid,null::bigint,null::text,null::text; return;
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
  if requested_component_slug='ultimate-b2-workbook' and (
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

create or replace function claim_builder_component_page_upload(requested_upload_id uuid,requested_expected_revision bigint,requested_client_mutation_id uuid,actor_builder_user_id uuid)
returns table(outcome text,book_slug text,component_slug text,page_key text,upload_mode text,current_revision bigint,page_metadata jsonb,file_descriptor jsonb,staging_object_key text)
language plpgsql as $$
declare session builder_component_page_upload_sessions%rowtype; revision_row builder_component_page_revisions%rowtype; resolved_book_slug text; resolved_component_slug text;
begin
  select * into session from builder_component_page_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id then
    return query select 'session_not_found',null::text,null::text,null::text,null::text,null::bigint,null::jsonb,null::jsonb,null::text; return;
  end if;
  select package.slug,component.slug into resolved_book_slug,resolved_component_slug from book_packages package join book_components component on component.book_package_id=package.id where component.id=session.book_component_id;
  select * into revision_row from builder_component_page_revisions where book_component_id=session.book_component_id for update;
  if session.client_mutation_id<>requested_client_mutation_id or session.expected_revision<>requested_expected_revision then
    return query select 'session_identity_conflict',null::text,null::text,null::text,null::text,revision_row.revision,null::jsonb,null::jsonb,null::text; return;
  end if;
  if session.state='completed' then
    return query select 'idempotent',resolved_book_slug,resolved_component_slug,session.page_key,session.upload_mode,session.resulting_revision,session.page_metadata,session.file_descriptor,session.staging_object_key; return;
  end if;
  if session.state='finalizing' then return query select 'finalize_in_progress',null::text,null::text,null::text,null::text,revision_row.revision,null::jsonb,null::jsonb,null::text; return; end if;
  if session.state<>'prepared' then return query select 'invalid_session_state',null::text,null::text,null::text,null::text,revision_row.revision,null::jsonb,null::jsonb,null::text; return; end if;
  if session.expires_at<=now() then
    update builder_component_page_upload_sessions set state='failed',failure_code='expired_session',updated_at=now() where id=session.id;
    return query select 'expired_session',null::text,null::text,null::text,null::text,revision_row.revision,null::jsonb,null::jsonb,null::text; return;
  end if;
  if revision_row.revision<>requested_expected_revision then return query select 'revision_conflict',null::text,null::text,null::text,null::text,revision_row.revision,null::jsonb,null::jsonb,null::text; return; end if;
  update builder_component_page_upload_sessions set state='finalizing',updated_at=now() where id=session.id;
  return query select 'claimed',resolved_book_slug,resolved_component_slug,session.page_key,session.upload_mode,revision_row.revision,session.page_metadata,session.file_descriptor,session.staging_object_key;
end $$;

create or replace function complete_builder_component_page_upload(
  requested_upload_id uuid,actor_builder_user_id uuid,requested_object_key text,requested_storage_bucket text,
  requested_mime_type text,requested_byte_size bigint,requested_checksum text,requested_width int,requested_height int
)
returns table(outcome text,page_id uuid,asset_id uuid,revision bigint) language plpgsql as $$
declare session builder_component_page_upload_sessions%rowtype; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype;
  edition book_editions%rowtype; created_asset_id uuid; package_slug text; component_slug text; page_slug text; student_component boolean;
begin
  select * into session from builder_component_page_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id or session.state<>'finalizing' then raise exception 'page upload session cannot be completed'; end if;
  if requested_mime_type not in ('image/png','image/jpeg','image/webp') or requested_byte_size<1 or requested_checksum!~'^[a-f0-9]{64}$' or requested_width<1 or requested_height<1 then raise exception 'page upload metadata is invalid'; end if;
  select package.slug,component.slug into package_slug,component_slug from book_packages package join book_components component on component.book_package_id=package.id where component.id=session.book_component_id;
  student_component:=component_slug='ultimate-b2-students-book';
  page_slug:=substring(session.page_key from char_length(component_slug)+8);
  select * into revision_row from builder_component_page_revisions where book_component_id=session.book_component_id for update;
  if revision_row.revision<>session.expected_revision then raise exception 'page revision changed during finalize'; end if;
  select * into page_row from book_pages where book_component_id=session.book_component_id and stable_key=session.page_key for update;
  if page_row.id is null then
    insert into book_pages(book_package_id,book_component_id,unit_id,stable_key,label,sort_order,source_metadata)
    values(session.book_package_id,session.book_component_id,null,session.page_key,session.page_metadata->>'label',(session.page_metadata->>'sortOrder')::int,
      jsonb_build_object('source','builder-pages','is_override',student_component,'is_active',not student_component,'printed_label',coalesce(session.page_metadata->>'printedLabel',''),'original_filename',session.file_descriptor->>'name')) returning * into page_row;
  else
    update book_pages set label=session.page_metadata->>'label',sort_order=(session.page_metadata->>'sortOrder')::int,
      source_metadata=source_metadata||jsonb_build_object('source','builder-pages','is_override',student_component,'is_active',not student_component,'printed_label',coalesce(session.page_metadata->>'printedLabel',''),'original_filename',session.file_descriptor->>'name'),updated_at=now()
    where id=page_row.id returning * into page_row;
  end if;
  insert into book_editions(book_package_id,edition_identifier,title,status,source_metadata)
  values(session.book_package_id,'builder-pages','Builder page assets','draft','{"source":"builder-pages"}'::jsonb)
  on conflict(book_package_id,edition_identifier) do update set updated_at=now() returning * into edition;
  update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and asset_role='page_image' and publication_status='draft';
  select id into created_asset_id from book_assets where storage_bucket=requested_storage_bucket and object_key=requested_object_key;
  if created_asset_id is not null then
    update book_assets set publication_status='draft',updated_at=now() where id=created_asset_id
      and book_package_id=session.book_package_id and book_component_id=session.book_component_id and page_id=page_row.id
      and asset_role='page_image' and mime_type=requested_mime_type and byte_size=requested_byte_size and checksum_sha256=requested_checksum
      and width=requested_width and height=requested_height and storage_profile='private' and access_level='internal';
    if not found then raise exception 'page managed asset identity conflict'; end if;
  else
    insert into book_assets(book_package_id,edition_id,book_component_id,unit_id,page_id,activity_id,stable_logical_key,asset_role,
      object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,width,height,edition_identifier,version,publication_status,access_level,source_metadata)
    values(session.book_package_id,edition.id,session.book_component_id,null,page_row.id,null,package_slug||'.builder-pages.'||component_slug||'.'||page_slug,
      'page_image',requested_object_key,'private',requested_storage_bucket,requested_mime_type,requested_byte_size,requested_checksum,requested_width,requested_height,
      'builder-pages',page_slug,'draft','internal',jsonb_build_object('upload_session_id',session.id,'original_filename',session.file_descriptor->>'name')) returning id into created_asset_id;
  end if;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=session.book_component_id returning * into revision_row;
  update builder_component_page_upload_sessions set state='completed',resulting_page_id=page_row.id,resulting_asset_id=created_asset_id,resulting_revision=revision_row.revision,finalized_at=now(),updated_at=now() where id=session.id;
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_asset_finalized','book_page',page_row.id::text,jsonb_build_object('component_slug',component_slug,'page_key',session.page_key,'revision',revision_row.revision));
  return query select 'saved',page_row.id,created_asset_id,revision_row.revision;
end $$;

create or replace function fail_builder_component_page_upload(requested_upload_id uuid,actor_builder_user_id uuid,requested_failure_code text)
returns boolean language plpgsql as $$
begin
  update builder_component_page_upload_sessions set state='failed',failure_code=left(requested_failure_code,64),updated_at=now()
  where id=requested_upload_id and created_by_builder_user_id=actor_builder_user_id and state in ('prepared','finalizing');
  return found or exists(select 1 from builder_component_page_upload_sessions where id=requested_upload_id and state='failed');
end $$;

create or replace function mutate_builder_component_page(
  requested_book_slug text,requested_component_slug text,requested_page_key text,requested_action text,requested_expected_revision bigint,
  requested_client_mutation_id uuid,requested_page_metadata jsonb,actor_builder_user_id uuid
)
returns table(outcome text,current_revision bigint) language plpgsql as $$
declare scope record; revision_row builder_component_page_revisions%rowtype; page_row book_pages%rowtype; existing builder_component_page_mutations%rowtype; request_value jsonb; page_slug text;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then return query select 'unauthorized_actor',null::bigint; return; end if;
  select * into scope from resolve_builder_page_component(requested_book_slug,requested_component_slug);
  if scope.book_component_id is null or requested_page_key not like requested_component_slug||'/pages/%' then return query select 'resource_not_found',null::bigint; return; end if;
  insert into builder_component_page_revisions(book_component_id) values(scope.book_component_id) on conflict do nothing;
  select * into revision_row from builder_component_page_revisions where book_component_id=scope.book_component_id for update;
  request_value:=jsonb_build_object('pageKey',requested_page_key,'action',requested_action,'metadata',requested_page_metadata);
  select * into existing from builder_component_page_mutations where book_component_id=scope.book_component_id and client_mutation_id=requested_client_mutation_id;
  if existing.client_mutation_id is not null then
    return query select case when existing.request_payload=request_value then 'idempotent' else 'mutation_id_conflict' end,existing.resulting_revision; return;
  end if;
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
        source_metadata=source_metadata||jsonb_build_object('printed_label',coalesce(requested_page_metadata->>'printedLabel','')),updated_at=now() where id=page_row.id;
    elsif requested_action='delete' then
      if exists(select 1 from builder_component_documents where book_component_id=scope.book_component_id and payload::text like '%'||page_slug||'%')
        or exists(select 1 from book_page_hotspots where package_slug=requested_book_slug and component_slug=requested_component_slug and page_id=page_slug)
        or exists(select 1 from book_activities where package_slug=requested_book_slug and component_slug=requested_component_slug and page_id=page_slug)
        or exists(select 1 from book_media_assets where package_slug=requested_book_slug and component_slug=requested_component_slug and page_id=page_slug)
        or exists(select 1 from book_assets where page_id=page_row.id and asset_role<>'page_image' and publication_status<>'archived') then
        return query select 'page_referenced',revision_row.revision; return;
      end if;
      update book_assets set publication_status='archived',updated_at=now() where page_id=page_row.id and publication_status='draft';
      update book_pages set source_metadata=source_metadata||'{"is_active":false}'::jsonb,updated_at=now() where id=page_row.id;
    else return query select 'operation_not_allowed',revision_row.revision; return; end if;
  end if;
  update builder_component_page_revisions set revision=revision+1,updated_at=now() where book_component_id=scope.book_component_id returning * into revision_row;
  insert into builder_component_page_mutations(book_component_id,client_mutation_id,request_payload,resulting_revision,created_by_builder_user_id)
  values(scope.book_component_id,requested_client_mutation_id,request_value,revision_row.revision,actor_builder_user_id);
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata) values(actor_builder_user_id,'component_page_'||requested_action,'book_page',page_row.id::text,jsonb_build_object('component_slug',requested_component_slug,'revision',revision_row.revision));
  return query select 'saved',revision_row.revision;
end $$;

drop trigger if exists set_builder_component_page_upload_updated_at on builder_component_page_upload_sessions;
create trigger set_builder_component_page_upload_updated_at before update on builder_component_page_upload_sessions for each row execute function set_updated_at();
