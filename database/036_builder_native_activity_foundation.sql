-- Atomic native activity draft creation. Canonical payloads remain in migration 032 documents.

create table if not exists builder_native_activity_creation_mutations (
  id bigint generated always as identity primary key,
  book_component_id uuid not null references book_components(id) on delete restrict,
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  activity_id text not null check (activity_id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  resulting_index_revision bigint not null check (resulting_index_revision >= 1),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint builder_native_activity_creation_mutations_unique unique(book_component_id, client_mutation_id)
);

create index if not exists builder_native_activity_creation_mutations_activity_idx
  on builder_native_activity_creation_mutations(book_component_id, activity_id);

drop trigger if exists builder_native_activity_creation_mutations_immutable
  on builder_native_activity_creation_mutations;
create trigger builder_native_activity_creation_mutations_immutable
before update or delete on builder_native_activity_creation_mutations
for each row execute function reject_builder_component_document_revision_mutation();

create or replace function create_builder_native_activity(
  requested_book_slug text,
  requested_component_slug text,
  requested_activity_id text,
  requested_kind text,
  expected_index_revision bigint,
  requested_index_payload jsonb,
  requested_index_sha256 text,
  requested_public_payload jsonb,
  requested_public_sha256 text,
  requested_teacher_payload jsonb,
  requested_teacher_sha256 text,
  requested_schema_version text,
  requested_request_sha256 text,
  actor_builder_user_id uuid,
  requested_client_mutation_id uuid
)
returns table (
  outcome text,
  activity_id text,
  index_revision bigint,
  public_revision bigint,
  teacher_revision bigint
)
language plpgsql
as $$
declare
  resolved_package_id uuid;
  resolved_component_id uuid;
  index_document_id uuid;
  public_document_id uuid;
  teacher_document_id uuid;
  current_index_revision bigint;
  next_index_revision bigint;
  replay builder_native_activity_creation_mutations%rowtype;
begin
  if not exists (
    select 1 from builder_users
    where id = actor_builder_user_id and status = 'active' and role = 'developer'
  ) then
    return query select 'unauthorized_actor'::text, null::text, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  select package.id, component.id
  into resolved_package_id, resolved_component_id
  from book_packages package
  join book_components component on component.book_package_id = package.id
  where package.slug = requested_book_slug and component.slug = requested_component_slug
  limit 1;

  if resolved_component_id is null then
    return query select 'resource_not_found'::text, null::text, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('builder-native-activity-component:' || resolved_component_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:' || resolved_component_id::text, 0));

  select * into replay
  from builder_native_activity_creation_mutations
  where book_component_id = resolved_component_id and client_mutation_id = requested_client_mutation_id;

  if replay.id is not null then
    if replay.request_sha256 <> requested_request_sha256 then
      return query select 'mutation_id_conflict'::text, replay.activity_id, replay.resulting_index_revision, 1::bigint, 1::bigint;
    else
      return query select 'idempotent'::text, replay.activity_id, replay.resulting_index_revision, 1::bigint, 1::bigint;
    end if;
    return;
  end if;

  select document.id, document.revision
  into index_document_id, current_index_revision
  from builder_component_documents document
  where document.book_component_id = resolved_component_id
    and document.document_type = 'native_activity_index'
    and document.document_key = 'default'
  for update;

  current_index_revision := coalesce(current_index_revision, 0);
  if current_index_revision <> expected_index_revision then
    return query select 'revision_conflict'::text, null::text, current_index_revision, null::bigint, null::bigint;
    return;
  end if;

  if exists (
    select 1 from builder_component_documents
    where book_component_id = resolved_component_id
      and document_key = requested_activity_id
      and document_type in ('native_activity_public', 'native_activity_teacher')
  ) then
    return query select 'identity_conflict'::text, requested_activity_id, current_index_revision, null::bigint, null::bigint;
    return;
  end if;

  next_index_revision := current_index_revision + 1;
  if index_document_id is null then
    insert into builder_component_documents(
      book_package_id, book_component_id, document_type, document_key, schema_version,
      revision, payload, payload_sha256, created_by_builder_user_id, updated_by_builder_user_id
    ) values (
      resolved_package_id, resolved_component_id, 'native_activity_index', 'default', requested_schema_version,
      next_index_revision, requested_index_payload, requested_index_sha256, actor_builder_user_id, actor_builder_user_id
    ) returning id into index_document_id;
  else
    update builder_component_documents
    set schema_version=requested_schema_version, revision=next_index_revision,
        payload=requested_index_payload, payload_sha256=requested_index_sha256,
        updated_by_builder_user_id=actor_builder_user_id, updated_at=now()
    where id=index_document_id;
  end if;

  insert into builder_component_documents(
    book_package_id, book_component_id, document_type, document_key, schema_version,
    revision, payload, payload_sha256, created_by_builder_user_id, updated_by_builder_user_id
  ) values (
    resolved_package_id, resolved_component_id, 'native_activity_public', requested_activity_id, requested_schema_version,
    1, requested_public_payload, requested_public_sha256, actor_builder_user_id, actor_builder_user_id
  ) returning id into public_document_id;

  insert into builder_component_documents(
    book_package_id, book_component_id, document_type, document_key, schema_version,
    revision, payload, payload_sha256, created_by_builder_user_id, updated_by_builder_user_id
  ) values (
    resolved_package_id, resolved_component_id, 'native_activity_teacher', requested_activity_id, requested_schema_version,
    1, requested_teacher_payload, requested_teacher_sha256, actor_builder_user_id, actor_builder_user_id
  ) returning id into teacher_document_id;

  insert into builder_component_document_revisions(document_id, revision, payload, payload_sha256, changed_by_builder_user_id, client_mutation_id)
  values
    (index_document_id, next_index_revision, requested_index_payload, requested_index_sha256, actor_builder_user_id, requested_client_mutation_id),
    (public_document_id, 1, requested_public_payload, requested_public_sha256, actor_builder_user_id, requested_client_mutation_id),
    (teacher_document_id, 1, requested_teacher_payload, requested_teacher_sha256, actor_builder_user_id, requested_client_mutation_id);

  insert into builder_native_activity_creation_mutations(
    book_component_id, client_mutation_id, request_sha256, activity_id,
    resulting_index_revision, created_by_builder_user_id
  ) values (
    resolved_component_id, requested_client_mutation_id, requested_request_sha256, requested_activity_id,
    next_index_revision, actor_builder_user_id
  );

  insert into builder_audit_log(builder_user_id, action, target_type, target_id, metadata)
  values (actor_builder_user_id, 'native_activity_created', 'builder_component_document', public_document_id::text,
    jsonb_build_object('book_slug', requested_book_slug, 'component_slug', requested_component_slug,
      'activity_id', requested_activity_id, 'kind', requested_kind, 'index_revision', next_index_revision));

  return query select 'created'::text, requested_activity_id, next_index_revision, 1::bigint, 1::bigint;
end;
$$;
