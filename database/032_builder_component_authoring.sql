-- Generic hosted Builder authoring state. These documents are not runtime/publication tables.

create unique index if not exists book_components_id_package_unique_idx
  on book_components(id, book_package_id);

create table if not exists builder_component_documents (
  id uuid primary key default gen_random_uuid(),
  book_package_id uuid not null references book_packages(id) on delete cascade,
  book_component_id uuid not null references book_components(id) on delete cascade,
  document_type text not null check (document_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  document_key text not null check (document_key ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  schema_version text not null check (schema_version ~ '^[0-9]+\.[0-9]+$'),
  revision bigint not null check (revision >= 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  updated_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint builder_component_documents_component_package_fk
    foreign key (book_component_id, book_package_id)
    references book_components(id, book_package_id) on delete cascade,
  constraint builder_component_documents_identity_unique
    unique (book_component_id, document_type, document_key)
);

create index if not exists builder_component_documents_package_idx
  on builder_component_documents(book_package_id, document_type, updated_at desc);
create index if not exists builder_component_documents_updated_by_idx
  on builder_component_documents(updated_by_builder_user_id, updated_at desc);

create table if not exists builder_component_document_revisions (
  id bigint generated always as identity primary key,
  document_id uuid not null references builder_component_documents(id) on delete restrict,
  revision bigint not null check (revision >= 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  changed_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  client_mutation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint builder_component_document_revisions_revision_unique unique (document_id, revision),
  constraint builder_component_document_revisions_mutation_unique unique (document_id, client_mutation_id)
);

create index if not exists builder_component_document_revisions_actor_idx
  on builder_component_document_revisions(changed_by_builder_user_id, created_at desc);
create index if not exists builder_component_document_revisions_recent_idx
  on builder_component_document_revisions(document_id, created_at desc);

create or replace function reject_builder_component_document_revision_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Builder component document revisions are append-only';
end;
$$;

drop trigger if exists builder_component_document_revisions_append_only
  on builder_component_document_revisions;
create trigger builder_component_document_revisions_append_only
before update or delete on builder_component_document_revisions
for each row execute function reject_builder_component_document_revision_mutation();

create or replace function save_builder_component_document(
  requested_book_slug text,
  requested_component_slug text,
  requested_document_type text,
  requested_document_key text,
  requested_schema_version text,
  expected_revision bigint,
  requested_payload jsonb,
  requested_payload_sha256 text,
  actor_builder_user_id uuid,
  requested_client_mutation_id uuid
)
returns table (
  outcome text,
  document_id uuid,
  saved_revision bigint,
  current_revision bigint,
  saved_payload jsonb,
  saved_payload_sha256 text
)
language plpgsql
as $$
declare
  resolved_package_id uuid;
  resolved_component_id uuid;
  current_document_id uuid;
  current_document_revision bigint;
  next_revision bigint;
  replay_revision bigint;
  replay_payload jsonb;
  replay_payload_sha256 text;
begin
  if not exists (
    select 1 from builder_users
    where id = actor_builder_user_id and status = 'active' and role = 'developer'
  ) then
    return query select 'unauthorized_actor'::text, null::uuid, null::bigint, null::bigint, null::jsonb, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'builder-document', requested_book_slug, requested_component_slug,
      requested_document_type, requested_document_key),
    0
  ));

  select package.id, component.id
  into resolved_package_id, resolved_component_id
  from book_packages package
  join book_components component on component.book_package_id = package.id
  where package.slug = requested_book_slug
    and component.slug = requested_component_slug
  limit 1;

  if resolved_package_id is null or resolved_component_id is null then
    return query select 'resource_not_found'::text, null::uuid, null::bigint, null::bigint, null::jsonb, null::text;
    return;
  end if;

  select document.id, document.revision
  into current_document_id, current_document_revision
  from builder_component_documents document
  where document.book_component_id = resolved_component_id
    and document.document_type = requested_document_type
    and document.document_key = requested_document_key
  for update;

  if current_document_id is not null then
    select history.revision, history.payload, history.payload_sha256
    into replay_revision, replay_payload, replay_payload_sha256
    from builder_component_document_revisions history
    where history.document_id = current_document_id
      and history.client_mutation_id = requested_client_mutation_id;

    if replay_revision is not null then
      if replay_payload_sha256 <> requested_payload_sha256 then
        return query select 'mutation_id_conflict'::text, current_document_id, replay_revision,
          current_document_revision, null::jsonb, replay_payload_sha256;
      else
        return query select 'idempotent'::text, current_document_id, replay_revision,
          current_document_revision, replay_payload, replay_payload_sha256;
      end if;
      return;
    end if;

    if current_document_revision <> expected_revision then
      return query select 'revision_conflict'::text, current_document_id, null::bigint,
        current_document_revision, null::jsonb, null::text;
      return;
    end if;

    next_revision := current_document_revision + 1;
    update builder_component_documents
    set schema_version = requested_schema_version,
        revision = next_revision,
        payload = requested_payload,
        payload_sha256 = requested_payload_sha256,
        updated_by_builder_user_id = actor_builder_user_id,
        updated_at = now()
    where id = current_document_id;
  else
    if expected_revision <> 0 then
      return query select 'revision_conflict'::text, null::uuid, null::bigint,
        0::bigint, null::jsonb, null::text;
      return;
    end if;

    next_revision := 1;
    insert into builder_component_documents(
      book_package_id, book_component_id, document_type, document_key,
      schema_version, revision, payload, payload_sha256,
      created_by_builder_user_id, updated_by_builder_user_id
    ) values (
      resolved_package_id, resolved_component_id, requested_document_type, requested_document_key,
      requested_schema_version, next_revision, requested_payload, requested_payload_sha256,
      actor_builder_user_id, actor_builder_user_id
    ) returning id into current_document_id;
  end if;

  insert into builder_component_document_revisions(
    document_id, revision, payload, payload_sha256,
    changed_by_builder_user_id, client_mutation_id
  ) values (
    current_document_id, next_revision, requested_payload, requested_payload_sha256,
    actor_builder_user_id, requested_client_mutation_id
  );

  insert into builder_audit_log(builder_user_id, action, target_type, target_id, metadata)
  values (
    actor_builder_user_id,
    'builder_document_saved',
    'builder_component_document',
    current_document_id::text,
    jsonb_build_object(
      'book_slug', requested_book_slug,
      'component_slug', requested_component_slug,
      'document_type', requested_document_type,
      'revision', next_revision,
      'source', 'database'
    )
  );

  return query select 'saved'::text, current_document_id, next_revision,
    next_revision, requested_payload, requested_payload_sha256;
end;
$$;
