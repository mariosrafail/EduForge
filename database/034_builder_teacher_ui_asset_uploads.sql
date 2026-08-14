-- Validated hosted Teacher UI candidates. The revisioned UI manifest remains in
-- builder_component_documents; this table preserves only the temporary upload trust boundary.

create table if not exists builder_teacher_ui_asset_upload_sessions (
  id uuid primary key,
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
  expected_revision bigint not null check (expected_revision >= 0),
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  file_descriptors jsonb not null check (jsonb_typeof(file_descriptors) = 'array'),
  validated_assets jsonb check (validated_assets is null or jsonb_typeof(validated_assets) = 'object'),
  state text not null default 'prepared' check (state in ('prepared','finalizing','validated','saved','failed','cancelled')),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  expires_at timestamptz not null,
  resulting_document_revision bigint,
  failure_code text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint builder_teacher_ui_upload_component_package_fk
    foreign key (book_component_id, book_package_id)
    references book_components(id, book_package_id) on delete cascade,
  constraint builder_teacher_ui_upload_mutation_unique
    unique (book_component_id, client_mutation_id),
  constraint builder_teacher_ui_upload_result_check check (
    (state in ('validated','saved') and validated_assets is not null)
    or (state not in ('validated','saved') and validated_assets is null)
  )
);

create index if not exists builder_teacher_ui_upload_expiry_idx
  on builder_teacher_ui_asset_upload_sessions(state, expires_at);
create index if not exists builder_teacher_ui_upload_actor_idx
  on builder_teacher_ui_asset_upload_sessions(created_by_builder_user_id, created_at desc);

create or replace function prepare_builder_teacher_ui_asset_upload(
  requested_book_slug text,
  requested_component_slug text,
  requested_expected_revision bigint,
  requested_client_mutation_id uuid,
  requested_upload_id uuid,
  requested_request_sha256 text,
  requested_file_descriptors jsonb,
  actor_builder_user_id uuid,
  requested_expires_at timestamptz
)
returns table (outcome text, upload_id uuid, current_revision bigint, session_state text, file_descriptors jsonb)
language plpgsql as $$
declare
  resolved_package_id uuid;
  resolved_component_id uuid;
  current_document_revision bigint;
  existing_session builder_teacher_ui_asset_upload_sessions%rowtype;
begin
  if not exists (select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text,null::uuid,null::bigint,null::text,null::jsonb; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','builder-teacher-ui-upload',requested_book_slug,requested_component_slug),0));
  select package.id,component.id into resolved_package_id,resolved_component_id
  from book_packages package join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug limit 1;
  if resolved_package_id is null then
    return query select 'resource_not_found'::text,null::uuid,null::bigint,null::text,null::jsonb; return;
  end if;
  select * into existing_session from builder_teacher_ui_asset_upload_sessions
  where book_component_id=resolved_component_id and client_mutation_id=requested_client_mutation_id;
  select coalesce((select revision from builder_component_documents
    where book_component_id=resolved_component_id and document_type='teacher_ui' and document_key='default'),0)
  into current_document_revision;
  if existing_session.id is not null then
    if existing_session.request_sha256<>requested_request_sha256 then
      return query select 'mutation_id_conflict'::text,existing_session.id,current_document_revision,existing_session.state,null::jsonb;
    else
      return query select 'idempotent'::text,existing_session.id,current_document_revision,existing_session.state,existing_session.file_descriptors;
    end if;
    return;
  end if;
  if current_document_revision<>requested_expected_revision then
    return query select 'revision_conflict'::text,null::uuid,current_document_revision,null::text,null::jsonb; return;
  end if;
  insert into builder_teacher_ui_asset_upload_sessions(
    id,book_package_id,book_component_id,expected_revision,client_mutation_id,request_sha256,
    file_descriptors,created_by_builder_user_id,expires_at
  ) values (
    requested_upload_id,resolved_package_id,resolved_component_id,requested_expected_revision,
    requested_client_mutation_id,requested_request_sha256,requested_file_descriptors,
    actor_builder_user_id,requested_expires_at
  );
  return query select 'prepared'::text,requested_upload_id,current_document_revision,'prepared'::text,requested_file_descriptors;
end;
$$;

create or replace function claim_builder_teacher_ui_asset_upload(
  requested_upload_id uuid,
  requested_expected_revision bigint,
  requested_client_mutation_id uuid,
  actor_builder_user_id uuid
)
returns table (outcome text, current_revision bigint, session_state text, file_descriptors jsonb, validated_assets jsonb)
language plpgsql as $$
declare
  session builder_teacher_ui_asset_upload_sessions%rowtype;
  current_document_revision bigint;
begin
  select * into session from builder_teacher_ui_asset_upload_sessions where id=requested_upload_id for update;
  if session.id is null or session.created_by_builder_user_id<>actor_builder_user_id then
    return query select 'session_not_found'::text,null::bigint,null::text,null::jsonb,null::jsonb; return;
  end if;
  if session.client_mutation_id<>requested_client_mutation_id or session.expected_revision<>requested_expected_revision then
    return query select 'session_identity_conflict'::text,null::bigint,session.state,null::jsonb,null::jsonb; return;
  end if;
  select coalesce((select revision from builder_component_documents
    where book_component_id=session.book_component_id and document_type='teacher_ui' and document_key='default'),0)
  into current_document_revision;
  if session.state in ('validated','saved') then
    return query select 'idempotent'::text,current_document_revision,session.state,session.file_descriptors,session.validated_assets; return;
  end if;
  if session.state='finalizing' then
    return query select 'finalize_in_progress'::text,current_document_revision,session.state,null::jsonb,null::jsonb; return;
  end if;
  if session.state<>'prepared' then
    return query select 'invalid_session_state'::text,current_document_revision,session.state,null::jsonb,null::jsonb; return;
  end if;
  if session.expires_at<=now() then
    update builder_teacher_ui_asset_upload_sessions set state='failed',failure_code='expired_session',updated_at=now() where id=session.id;
    return query select 'expired_session'::text,current_document_revision,'failed'::text,null::jsonb,null::jsonb; return;
  end if;
  if current_document_revision<>requested_expected_revision then
    return query select 'revision_conflict'::text,current_document_revision,session.state,null::jsonb,null::jsonb; return;
  end if;
  update builder_teacher_ui_asset_upload_sessions set state='finalizing',updated_at=now() where id=session.id;
  return query select 'claimed'::text,current_document_revision,'finalizing'::text,session.file_descriptors,null::jsonb;
end;
$$;

create or replace function complete_builder_teacher_ui_asset_upload(
  requested_upload_id uuid,
  actor_builder_user_id uuid,
  requested_validated_assets jsonb
)
returns boolean language plpgsql as $$
begin
  update builder_teacher_ui_asset_upload_sessions
  set state='validated',validated_assets=requested_validated_assets,finalized_at=now(),updated_at=now()
  where id=requested_upload_id and created_by_builder_user_id=actor_builder_user_id and state='finalizing';
  return found;
end;
$$;

create or replace function fail_builder_teacher_ui_asset_upload(
  requested_upload_id uuid,
  actor_builder_user_id uuid,
  requested_failure_code text
)
returns boolean language plpgsql as $$
begin
  update builder_teacher_ui_asset_upload_sessions
  set state='failed',failure_code=left(requested_failure_code,64),updated_at=now()
  where id=requested_upload_id and created_by_builder_user_id=actor_builder_user_id and state in ('prepared','finalizing');
  return found;
end;
$$;

drop trigger if exists set_builder_teacher_ui_upload_updated_at on builder_teacher_ui_asset_upload_sessions;
create trigger set_builder_teacher_ui_upload_updated_at before update on builder_teacher_ui_asset_upload_sessions
for each row execute function set_updated_at();
