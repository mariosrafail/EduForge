-- Atomic logical native-activity retirement and active-membership enforcement.
-- Historical documents, revisions, mutations, releases, and assets remain immutable.

create table if not exists builder_native_activity_deletion_mutations (
  id bigint generated always as identity primary key,
  book_component_id uuid not null references book_components(id) on delete restrict,
  client_mutation_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  activity_id text not null check (activity_id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  resulting_index_revision bigint not null check (resulting_index_revision >= 1),
  resulting_hotspot_revision bigint not null check (resulting_hotspot_revision >= 0),
  removed_hotspot_count int not null check (removed_hotspot_count >= 0),
  created_by_builder_user_id uuid not null references builder_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(book_component_id, client_mutation_id)
);

create index if not exists builder_native_activity_deletion_activity_idx
  on builder_native_activity_deletion_mutations(book_component_id, activity_id);

drop trigger if exists builder_native_activity_deletion_mutations_immutable
  on builder_native_activity_deletion_mutations;
create trigger builder_native_activity_deletion_mutations_immutable
before update or delete on builder_native_activity_deletion_mutations
for each row execute function reject_builder_component_document_revision_mutation();

create or replace function builder_native_activity_is_active(requested_component_id uuid, requested_activity_id text)
returns boolean language sql stable as $$
  select exists(
    select 1
    from builder_component_documents document
    cross join lateral jsonb_array_elements(coalesce(document.payload->'activities', '[]'::jsonb)) activity
    where document.book_component_id=requested_component_id
      and document.document_type='native_activity_index'
      and document.document_key='default'
      and activity->>'activityId'=requested_activity_id
  );
$$;

create or replace function enforce_active_builder_native_document_update()
returns trigger language plpgsql as $$
begin
  if new.document_type in ('native_activity_public','native_activity_teacher')
    and not builder_native_activity_is_active(new.book_component_id,new.document_key)
  then
    raise exception 'native activity is not active' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_native_document_requires_active_index on builder_component_documents;
create trigger builder_native_document_requires_active_index
before update on builder_component_documents
for each row execute function enforce_active_builder_native_document_update();

create or replace function enforce_active_builder_native_upload_session()
returns trigger language plpgsql as $$
begin
  if new.state in ('prepared','finalizing','completed')
    and not builder_native_activity_is_active(new.book_component_id,new.activity_id)
  then
    raise exception 'native activity is not active' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_native_upload_requires_active_index on builder_native_asset_upload_sessions;
create trigger builder_native_upload_requires_active_index
before insert or update on builder_native_asset_upload_sessions
for each row execute function enforce_active_builder_native_upload_session();

create or replace function enforce_active_builder_native_draft_asset()
returns trigger language plpgsql as $$
declare requested_activity_id text;
begin
  requested_activity_id := new.source_metadata->>'native_activity_id';
  if requested_activity_id is not null
    and new.publication_status='draft'
    and new.storage_profile='private'
    and new.access_level='internal'
    and not builder_native_activity_is_active(new.book_component_id,requested_activity_id)
  then
    raise exception 'native activity is not active' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_native_draft_asset_requires_active_index on book_assets;
create trigger builder_native_draft_asset_requires_active_index
before insert on book_assets
for each row execute function enforce_active_builder_native_draft_asset();

create or replace function delete_builder_native_activity(
  requested_book_slug text,
  requested_component_slug text,
  requested_activity_id text,
  expected_index_revision bigint,
  requested_index_payload jsonb,
  requested_index_sha256 text,
  requested_index_schema_version text,
  expected_hotspot_revision bigint,
  requested_hotspot_payload jsonb,
  requested_hotspot_sha256 text,
  requested_hotspot_schema_version text,
  requested_hotspot_changed boolean,
  requested_removed_hotspot_count int,
  requested_request_sha256 text,
  actor_builder_user_id uuid,
  requested_client_mutation_id uuid
)
returns table(
  outcome text,
  activity_id text,
  index_revision bigint,
  hotspot_revision bigint,
  removed_hotspot_count int
)
language plpgsql as $$
declare
  resolved_package_id uuid;
  resolved_component_id uuid;
  index_document builder_component_documents%rowtype;
  hotspot_document builder_component_documents%rowtype;
  replay builder_native_activity_deletion_mutations%rowtype;
  next_index_revision bigint;
  next_hotspot_revision bigint;
  derived_index_payload jsonb;
begin
  if not exists(select 1 from builder_users where id=actor_builder_user_id and status='active' and role='developer') then
    return query select 'unauthorized_actor'::text,null::text,null::bigint,null::bigint,null::int;
    return;
  end if;

  select package.id,component.id into resolved_package_id,resolved_component_id
  from book_packages package
  join book_components component on component.book_package_id=package.id
  where package.slug=requested_book_slug and component.slug=requested_component_slug
  limit 1;
  if resolved_component_id is null then
    return query select 'resource_not_found'::text,null::text,null::bigint,null::bigint,null::int;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('builder-native-activity-component:' || resolved_component_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('builder-publication-component:' || resolved_component_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('builder-native-activity:' || resolved_component_id::text || ':' || requested_activity_id,0));
  perform pg_advisory_xact_lock(hashtextextended('builder-native-assets:' || resolved_component_id::text || ':' || requested_activity_id,0));
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':','builder-document',requested_book_slug,requested_component_slug,'hotspots','default'),0
  ));

  select * into replay from builder_native_activity_deletion_mutations
  where book_component_id=resolved_component_id and client_mutation_id=requested_client_mutation_id;
  if replay.id is not null then
    if replay.request_sha256<>requested_request_sha256 then
      return query select 'mutation_id_conflict'::text,replay.activity_id,replay.resulting_index_revision,replay.resulting_hotspot_revision,replay.removed_hotspot_count;
    else
      return query select 'idempotent'::text,replay.activity_id,replay.resulting_index_revision,replay.resulting_hotspot_revision,replay.removed_hotspot_count;
    end if;
    return;
  end if;

  select * into index_document from builder_component_documents
  where book_component_id=resolved_component_id and document_type='native_activity_index' and document_key='default'
  for update;
  if index_document.id is null or not builder_native_activity_is_active(resolved_component_id,requested_activity_id) then
    return query select 'activity_not_active'::text,requested_activity_id,coalesce(index_document.revision,0),null::bigint,0::int;
    return;
  end if;

  select * into hotspot_document from builder_component_documents
  where book_component_id=resolved_component_id and document_type='hotspots' and document_key='default'
  for update;
  if index_document.revision<>expected_index_revision
    or coalesce(hotspot_document.revision,0)<>expected_hotspot_revision
  then
    return query select 'revision_conflict'::text,requested_activity_id,index_document.revision,coalesce(hotspot_document.revision,0),0::int;
    return;
  end if;

  select jsonb_set(index_document.payload,'{activities}',coalesce(jsonb_agg(entry.value order by entry.ordinality),'[]'::jsonb))
  into derived_index_payload
  from jsonb_array_elements(coalesce(index_document.payload->'activities','[]'::jsonb)) with ordinality entry(value,ordinality)
  where entry.value->>'activityId'<>requested_activity_id;
  if derived_index_payload<>requested_index_payload then
    raise exception 'native activity deletion index candidate is invalid';
  end if;

  next_index_revision := index_document.revision + 1;
  update builder_component_documents
  set schema_version=requested_index_schema_version,revision=next_index_revision,payload=requested_index_payload,
      payload_sha256=requested_index_sha256,updated_by_builder_user_id=actor_builder_user_id,updated_at=now()
  where id=index_document.id;
  insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id)
  values(index_document.id,next_index_revision,requested_index_payload,requested_index_sha256,actor_builder_user_id,requested_client_mutation_id);

  next_hotspot_revision := coalesce(hotspot_document.revision,0);
  if requested_hotspot_changed then
    next_hotspot_revision := next_hotspot_revision + 1;
    if hotspot_document.id is null then
      insert into builder_component_documents(
        book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,
        created_by_builder_user_id,updated_by_builder_user_id
      ) values(
        resolved_package_id,resolved_component_id,'hotspots','default',requested_hotspot_schema_version,next_hotspot_revision,
        requested_hotspot_payload,requested_hotspot_sha256,actor_builder_user_id,actor_builder_user_id
      ) returning * into hotspot_document;
    else
      update builder_component_documents
      set schema_version=requested_hotspot_schema_version,revision=next_hotspot_revision,payload=requested_hotspot_payload,
          payload_sha256=requested_hotspot_sha256,updated_by_builder_user_id=actor_builder_user_id,updated_at=now()
      where id=hotspot_document.id;
    end if;
    insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id)
    values(hotspot_document.id,next_hotspot_revision,requested_hotspot_payload,requested_hotspot_sha256,actor_builder_user_id,requested_client_mutation_id);
  end if;

  insert into builder_native_activity_deletion_mutations(
    book_component_id,client_mutation_id,request_sha256,activity_id,resulting_index_revision,
    resulting_hotspot_revision,removed_hotspot_count,created_by_builder_user_id
  ) values(
    resolved_component_id,requested_client_mutation_id,requested_request_sha256,requested_activity_id,next_index_revision,
    next_hotspot_revision,requested_removed_hotspot_count,actor_builder_user_id
  );
  insert into builder_audit_log(builder_user_id,action,target_type,target_id,metadata)
  values(actor_builder_user_id,'native_activity_deleted','builder_component_document',index_document.id::text,
    jsonb_build_object('book_slug',requested_book_slug,'component_slug',requested_component_slug,
      'activity_id',requested_activity_id,'index_revision',next_index_revision,
      'hotspot_revision',next_hotspot_revision,'removed_hotspot_count',requested_removed_hotspot_count));

  return query select 'deleted'::text,requested_activity_id,next_index_revision,next_hotspot_revision,requested_removed_hotspot_count;
end;
$$;
